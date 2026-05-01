/**
 * `calculateDepthHint` — the SDK's headline primitive.
 *
 * Given a v4 pool's current state, the initialized tick liquidity, and a target
 * trade (size + direction + slippage tolerance), this function returns a
 * recommendation for the JIT range a solver should add liquidity at, plus the
 * expected fee capture, slippage, and net profit.
 *
 * The math here is in the *off-chain* path — wrong here means the solver
 * commits to losing trades. The implementation mirrors the v3/v4 swap formula
 * exactly so that a fork-test (deferred to Sprint 02 Plan 04+) can prove the
 * predicted slippage matches an actual on-chain swap within 1bp.
 */

import { mulDiv } from './fullMath';
import { MAX_TICK, MIN_TICK, getSqrtRatioAtTick, getTickAtSqrtRatio } from './tickMath';

/**
 * Subset of the indexer's `pool` row that the calculator needs. Decoupling from
 * the Drizzle row type keeps this module independent of Ponder's schema typing.
 */
export interface DepthPool {
  id: `0x${string}`;
  sqrtPriceX96: bigint;
  liquidity: bigint;
  tick: number;
  tickSpacing: number;
  fee: number; // pool LP fee in hundredths of a bip (3000 = 0.30%)
}

/** Initialized tick liquidity. Currently unused (depth hint uses the swap formula
 *  directly off pool.liquidity); reserved for future depth-aware extensions in
 *  Plan 04+ that walk the tick array. */
export interface DepthTick {
  tickIdx: number;
  liquidityNet: bigint;
  liquidityGross: bigint;
}

export interface DepthQuery {
  poolId: `0x${string}`;
  /** Trade size in input-token wei. */
  tradeSize: bigint;
  /** True for token0 → token1; false for token1 → token0. */
  zeroForOne: boolean;
  /** Maximum acceptable slippage in basis points (1bp = 0.01%). */
  slippageBps: number;
  /** Optional gas-price override (wei). Defaults to 1 gwei when not provided. */
  gasPriceWei?: bigint;
  /** Estimated gas overhead of the JIT pattern. Default: 600,000 (matches plan). */
  gasOverhead?: bigint;
}

export interface DepthHint {
  recommendedTickLower: number;
  recommendedTickUpper: number;
  recommendedLiquidityDelta: bigint;
  /** Fee captured from the swap, in input-token wei. */
  expectedFeeCapture: bigint;
  /** Slippage between current and target sqrtPrice, in basis points. */
  expectedSlippageBps: number;
  /** Gas units the JIT pattern is expected to consume. */
  expectedGasOverhead: bigint;
  /** Net profit estimate in wei (fee capture minus gas cost). Floored at 0. */
  estimatedNetProfit: bigint;
  /** Snapshot of pool state used for the calculation (for client diagnostics). */
  poolCurrentTick: number;
  poolCurrentSqrtPrice: bigint;
}

const Q96 = 1n << 96n;
const SAFETY_MARGIN_TICKS = 1; // ± 1 tickSpacing buffer on each side
const DEFAULT_GAS_OVERHEAD = 600_000n;
const DEFAULT_GAS_PRICE_WEI = 1_000_000_000n; // 1 gwei
const FEE_DENOMINATOR = 1_000_000n; // v4 fee tier: hundredths of a bip → /1e6

/**
 * Compute a JIT depth hint for a pool + trade query.
 *
 * @throws if the pool's liquidity is zero — JIT requires existing liquidity to be
 *         meaningful (the math degenerates to "trade is the entire pool").
 * @throws if `tradeSize` is zero or negative.
 * @throws if the slippage budget would push sqrtPrice past the global tick bounds.
 */
export function calculateDepthHint(
  pool: DepthPool,
  _ticks: readonly DepthTick[],
  query: DepthQuery,
): DepthHint {
  if (query.tradeSize <= 0n) {
    throw new Error('calculateDepthHint: tradeSize must be positive');
  }
  if (pool.liquidity <= 0n) {
    throw new Error('calculateDepthHint: pool.liquidity must be positive');
  }
  if (pool.tickSpacing <= 0) {
    throw new Error('calculateDepthHint: pool.tickSpacing must be positive');
  }

  // Step 1: target sqrtPrice after consuming the trade against `pool.liquidity`.
  const targetSqrtPrice = computeTargetSqrtPrice(
    pool.sqrtPriceX96,
    query.tradeSize,
    pool.liquidity,
    query.zeroForOne,
  );

  // Step 2: tick at the target sqrtPrice (clamped to pool tick range).
  const targetTick = clampTick(getTickAtSqrtRatio(clampSqrt(targetSqrtPrice)));

  // Step 3: range covering [start, end] of the swap traversal (direction-aware).
  let tickLower: number;
  let tickUpper: number;
  if (query.zeroForOne) {
    // Selling token0 → price decreases → final tick is lower.
    tickLower = floorToSpacing(targetTick, pool.tickSpacing);
    tickUpper = ceilToSpacing(pool.tick, pool.tickSpacing);
  } else {
    // Buying token0 → price increases → final tick is higher.
    tickLower = floorToSpacing(pool.tick, pool.tickSpacing);
    tickUpper = ceilToSpacing(targetTick, pool.tickSpacing);
  }

  // Step 4: safety margin on each side.
  tickLower -= SAFETY_MARGIN_TICKS * pool.tickSpacing;
  tickUpper += SAFETY_MARGIN_TICKS * pool.tickSpacing;

  // Step 5: re-snap + ensure ordering after the margin shift.
  tickLower = floorToSpacing(tickLower, pool.tickSpacing);
  tickUpper = ceilToSpacing(tickUpper, pool.tickSpacing);
  if (tickLower >= tickUpper) tickUpper = tickLower + pool.tickSpacing;

  // Step 6: clamp to the global tick range.
  tickLower = Math.max(tickLower, alignDownToSpacing(MIN_TICK, pool.tickSpacing));
  tickUpper = Math.min(tickUpper, alignUpToSpacing(MAX_TICK, pool.tickSpacing));
  if (tickLower >= tickUpper) {
    throw new Error('calculateDepthHint: range collapsed past the global tick bounds');
  }

  // Step 7: the liquidity required so the trade fits inside the JIT range.
  const sqrtPriceLower = getSqrtRatioAtTick(tickLower);
  const sqrtPriceUpper = getSqrtRatioAtTick(tickUpper);
  const liquidityDelta = computeRequiredLiquidity(
    pool.sqrtPriceX96,
    sqrtPriceLower,
    sqrtPriceUpper,
    query.tradeSize,
    query.zeroForOne,
  );

  // Step 8: fee capture (LP fee on the input).
  const expectedFeeCapture = mulDiv(query.tradeSize, BigInt(pool.fee), FEE_DENOMINATOR);

  // Step 9: slippage in bps.
  const expectedSlippageBps = computeSlippageBps(pool.sqrtPriceX96, targetSqrtPrice);

  // Step 10: gas overhead + net profit.
  const expectedGasOverhead = query.gasOverhead ?? DEFAULT_GAS_OVERHEAD;
  const gasPrice = query.gasPriceWei ?? DEFAULT_GAS_PRICE_WEI;
  const gasCostWei = expectedGasOverhead * gasPrice;
  const estimatedNetProfit =
    expectedFeeCapture > gasCostWei ? expectedFeeCapture - gasCostWei : 0n;

  return {
    recommendedTickLower: tickLower,
    recommendedTickUpper: tickUpper,
    recommendedLiquidityDelta: liquidityDelta,
    expectedFeeCapture,
    expectedSlippageBps,
    expectedGasOverhead,
    estimatedNetProfit,
    poolCurrentTick: pool.tick,
    poolCurrentSqrtPrice: pool.sqrtPriceX96,
  };
}

// ============ Internal math ============

/**
 * Apply the v3/v4 single-step swap formula to compute the sqrtPrice after
 * consuming `tradeSize` of input against constant `liquidity`.
 *
 * Reference: Uniswap v3 whitepaper, Eq. 6.13 / 6.14.
 *
 *   zeroForOne (selling token0 → price decreases):
 *     sqrt' = liquidity × sqrt / (liquidity + tradeSize × sqrt / Q96)
 *   oneForZero (buying token0 → price increases):
 *     sqrt' = sqrt + tradeSize × Q96 / liquidity
 */
function computeTargetSqrtPrice(
  startSqrtPrice: bigint,
  tradeSize: bigint,
  liquidity: bigint,
  zeroForOne: boolean,
): bigint {
  if (zeroForOne) {
    const num = liquidity * startSqrtPrice;
    const den = liquidity + (tradeSize * startSqrtPrice) / Q96;
    return num / den;
  }
  return startSqrtPrice + (tradeSize * Q96) / liquidity;
}

/**
 * Solve the v3 liquidity formula for L given that the trade should traverse the
 * range without exceeding either boundary.
 *
 *   zeroForOne:  L = tradeSize × sqrt × sqrtLower / (sqrt - sqrtLower)
 *                (rearranged from Δx = L × (1/sqrtLower - 1/sqrt))
 *   oneForZero:  L = tradeSize × Q96 / (sqrtUpper - sqrt)
 *                (from Δy = L × (sqrtUpper - sqrt) / Q96)
 *
 * Edge cases (current price already at or past the boundary) return `tradeSize`
 * as a safe upper bound — the caller will discover the range doesn't cover the
 * trade when running the simulation.
 */
function computeRequiredLiquidity(
  currentSqrtPrice: bigint,
  sqrtPriceLower: bigint,
  sqrtPriceUpper: bigint,
  tradeSize: bigint,
  zeroForOne: boolean,
): bigint {
  if (zeroForOne) {
    if (currentSqrtPrice <= sqrtPriceLower) return tradeSize;
    const num = mulDiv(tradeSize, currentSqrtPrice, Q96) * sqrtPriceLower;
    const den = currentSqrtPrice - sqrtPriceLower;
    return num / den;
  }
  if (currentSqrtPrice >= sqrtPriceUpper) return tradeSize;
  return (tradeSize * Q96) / (sqrtPriceUpper - currentSqrtPrice);
}

/**
 * Slippage in basis points = |startPrice - endPrice| × 10000 / startPrice.
 * `startPrice` and `endPrice` are derived from sqrtPrice² with the implicit Q192
 * scale that cancels in the ratio.
 */
function computeSlippageBps(startSqrtPrice: bigint, endSqrtPrice: bigint): number {
  if (startSqrtPrice === 0n) return 0;
  const startSq = startSqrtPrice * startSqrtPrice;
  const endSq = endSqrtPrice * endSqrtPrice;
  const diff = startSq > endSq ? startSq - endSq : endSq - startSq;
  // The Q192 factor cancels: bps = floor(diff × 10000 / startSq).
  return Number((diff * 10_000n) / startSq);
}

// ============ Tick spacing helpers ============

function floorToSpacing(tick: number, spacing: number): number {
  // Math.floor(t/s) is correct for negative t (rounds toward -infinity).
  return Math.floor(tick / spacing) * spacing;
}

function ceilToSpacing(tick: number, spacing: number): number {
  return Math.ceil(tick / spacing) * spacing;
}

/** Largest multiple of `spacing` that's `<= tick`. Same as `floorToSpacing`. */
function alignDownToSpacing(tick: number, spacing: number): number {
  return floorToSpacing(tick, spacing);
}

/** Smallest multiple of `spacing` that's `>= tick`. Same as `ceilToSpacing`. */
function alignUpToSpacing(tick: number, spacing: number): number {
  return ceilToSpacing(tick, spacing);
}

function clampTick(tick: number): number {
  if (tick < MIN_TICK) return MIN_TICK;
  if (tick > MAX_TICK) return MAX_TICK;
  return tick;
}

function clampSqrt(sqrt: bigint): bigint {
  // The TickMath input bounds — `getTickAtSqrtRatio` throws outside this window.
  // We clamp here so the calculator gracefully degrades on tradeSize that would
  // push the sqrtPrice past the bounds rather than throwing from inside the math.
  if (sqrt < 4_295_128_739n) return 4_295_128_739n;
  const MAX_INPUT = 1_461_446_703_485_210_103_287_273_052_203_988_822_378_723_970_341n;
  if (sqrt > MAX_INPUT) return MAX_INPUT;
  return sqrt;
}
