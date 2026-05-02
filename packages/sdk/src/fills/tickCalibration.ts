/**
 * `calibrateTickRange` — refines an indexer's depth hint into a v4-safe
 * tick range. This is the file Plan 05 fills with real refinement; the
 * Plan 04 pass-through validator has been replaced.
 *
 * Pipeline:
 *
 *   1. Validate INPUT invariants from the hint. Garbage in (`baseLower >=
 *      baseUpper`, non-positive liquidity, non-integer ticks, non-positive
 *      tickSpacing) is the indexer's fault — throw `InsufficientLiquidityError`
 *      so the FillEngine can convert it into a clean `prepare → null`.
 *
 *   2. Apply a `safetyMarginTicks` widening per side (default 1 tickSpacing).
 *      Wider ranges absorb more price drift between simulate + broadcast.
 *
 *   3. Snap to `pool.tickSpacing` — floor for lower, ceil for upper. v4
 *      enforces `tick % tickSpacing == 0` on-chain; we do the snap here so
 *      a misaligned hint becomes a usable fill instead of a revert.
 *
 *   4. Cap to `[MIN_TICK, MAX_TICK]` (spacing-aligned). The ceil/floor of
 *      MIN_TICK / MAX_TICK to spacing is the actual usable bound.
 *
 *   5. Scale `liquidityDelta` proportionally to the range widening
 *      (`new_width / original_width`). This is a HEURISTIC, not the formal
 *      v4 invariant: real liquidity-to-depth scaling is non-linear in tick
 *      width via sqrt-price. The linear approximation is conservative for
 *      typical 1-tick widenings (we err toward MORE liquidity, not less).
 *      Solver authors who want optimal scaling can override with a custom
 *      `Calibrator` (future plan) or use `@filler-sdk/jit-hints`'s depth
 *      calculator directly.
 *
 *   6. Cap the result with `maxLiquidityMultiplier` (default 10×) so a buggy
 *      indexer hint can't request unbounded inventory.
 *
 *   7. Validate OUTPUT invariants. Edge case: when capping pushes both
 *      ticks against MAX_TICK (or MIN_TICK), we must still satisfy
 *      `tickLower < tickUpper`; we enforce by sliding the lower side back.
 */

import { ConfigInvalidError, InsufficientLiquidityError } from '../errors';
import type { DepthHint, Intent, PoolInfo } from '../types';

// v4 tick limits — `TickMath.MIN_TICK` / `MAX_TICK`. Mirrored from
// contracts/lib/v4-core/src/libraries/TickMath.sol. Also matches the
// `MIN_TICK` / `MAX_TICK` constants in `@filler-sdk/jit-hints`'s TickMath
// port (Sprint 02 Plan 04). Kept inline so the SDK bundle doesn't pull
// jit-hints at runtime.
const MIN_TICK = -887_272;
const MAX_TICK = 887_272;

const DEFAULT_SAFETY_MARGIN_TICKS = 1;
const DEFAULT_MAX_LIQUIDITY_MULTIPLIER = 10n;

export interface CalibratedRange {
  tickLower: number;
  tickUpper: number;
  liquidityDelta: bigint;
}

export interface CalibrationOptions {
  /**
   * Widen the range by `safetyMarginTicks * pool.tickSpacing` per side.
   * Default 1. Set to 0 to take the indexer's hint exactly as-is (after
   * snapping).
   */
  safetyMarginTicks?: number;
  /**
   * Cap on the FINAL `liquidityDelta` as a multiple of the indexer's hint.
   * Defaults to 10× — bigger growth than that almost certainly indicates a
   * misconfigured calibration or a buggy hint.
   */
  maxLiquidityMultiplier?: bigint;
}

export interface CalibrateInput {
  pool: PoolInfo;
  hint: DepthHint;
  intent: Intent;
  options?: CalibrationOptions;
}

export function calibrateTickRange(input: CalibrateInput): CalibratedRange {
  const { pool, hint } = input;
  const safetyMarginTicks =
    input.options?.safetyMarginTicks ?? DEFAULT_SAFETY_MARGIN_TICKS;
  const maxLiquidityMultiplier =
    input.options?.maxLiquidityMultiplier ?? DEFAULT_MAX_LIQUIDITY_MULTIPLIER;

  if (!Number.isInteger(safetyMarginTicks) || safetyMarginTicks < 0) {
    throw new ConfigInvalidError(
      `safetyMarginTicks must be a non-negative integer; got ${safetyMarginTicks}`,
    );
  }
  if (maxLiquidityMultiplier <= 0n) {
    throw new ConfigInvalidError(
      `maxLiquidityMultiplier must be > 0n; got ${maxLiquidityMultiplier.toString()}`,
    );
  }
  if (!Number.isInteger(pool.tickSpacing) || pool.tickSpacing <= 0) {
    throw new InsufficientLiquidityError(
      `pool.tickSpacing must be a positive integer; got ${pool.tickSpacing}`,
      { context: { poolId: pool.id } },
    );
  }

  const baseLower = hint.hint.tickLower;
  const baseUpper = hint.hint.tickUpper;
  const baseLiquidity = hint.hint.liquidityDelta;

  // === Input invariants — indexer-side bugs throw, FillEngine catches → null
  if (!Number.isInteger(baseLower) || !Number.isInteger(baseUpper)) {
    throw new InsufficientLiquidityError(
      `non-integer ticks from indexer: ${baseLower}, ${baseUpper}`,
      { context: { poolId: pool.id } },
    );
  }
  if (baseLower >= baseUpper) {
    throw new InsufficientLiquidityError(
      `tickLower (${baseLower}) must be < tickUpper (${baseUpper})`,
      { context: { poolId: pool.id } },
    );
  }
  if (baseLiquidity <= 0n) {
    throw new InsufficientLiquidityError(
      `non-positive liquidityDelta: ${baseLiquidity.toString()}`,
      { context: { poolId: pool.id } },
    );
  }

  // === Stage 1: widen + snap to spacing
  const margin = safetyMarginTicks * pool.tickSpacing;
  let tickLower = floorToSpacing(baseLower - margin, pool.tickSpacing);
  let tickUpper = ceilToSpacing(baseUpper + margin, pool.tickSpacing);

  // === Stage 2: cap to spacing-aligned MIN_TICK / MAX_TICK
  // The actual usable lower bound is `ceil(MIN_TICK / spacing) * spacing`,
  // upper bound is `floor(MAX_TICK / spacing) * spacing`. Anything outside
  // would revert in v4's `Pools.modifyLiquidity` validation.
  const minBound = ceilToSpacing(MIN_TICK, pool.tickSpacing);
  const maxBound = floorToSpacing(MAX_TICK, pool.tickSpacing);
  if (tickLower < minBound) tickLower = minBound;
  if (tickUpper > maxBound) tickUpper = maxBound;

  // === Stage 3: ensure tickLower < tickUpper after capping
  if (tickLower >= tickUpper) {
    if (tickUpper + pool.tickSpacing <= maxBound) {
      tickUpper = tickUpper + pool.tickSpacing;
    } else if (tickLower - pool.tickSpacing >= minBound) {
      tickLower = tickLower - pool.tickSpacing;
    } else {
      // Pool is so narrow its single tickSpacing-aligned slot doesn't fit a
      // valid range. This is an extreme corner — refuse the fill.
      throw new InsufficientLiquidityError(
        `cannot widen calibration without violating tick bounds: [${tickLower}, ${tickUpper}], spacing=${pool.tickSpacing}`,
        { context: { poolId: pool.id, MIN_TICK, MAX_TICK } },
      );
    }
  }

  // === Stage 4: proportional liquidity scaling
  const originalWidth = baseUpper - baseLower;
  const newWidth = tickUpper - tickLower;
  let liquidityDelta = baseLiquidity;
  if (originalWidth > 0 && newWidth !== originalWidth) {
    // Scale by ratio of widths (BigInt precision — divide AFTER multiply).
    liquidityDelta = (baseLiquidity * BigInt(newWidth)) / BigInt(originalWidth);
  }

  // === Stage 5: cap on growth
  const liquidityCap = baseLiquidity * maxLiquidityMultiplier;
  if (liquidityDelta > liquidityCap) liquidityDelta = liquidityCap;

  // === Output invariant
  if (liquidityDelta <= 0n) {
    throw new InsufficientLiquidityError(
      `calibration produced non-positive liquidityDelta: ${liquidityDelta.toString()}`,
      { context: { poolId: pool.id, baseLiquidity: baseLiquidity.toString() } },
    );
  }

  return { tickLower, tickUpper, liquidityDelta };
}

// === pure helpers (exported for tests) ====================================

/** Round `tick` DOWN to the nearest multiple of `spacing`. Symmetric for negatives. */
export function floorToSpacing(tick: number, spacing: number): number {
  // Math.floor handles negatives correctly: -119 / 60 = -1.98... → -2 → -120.
  return Math.floor(tick / spacing) * spacing;
}

/** Round `tick` UP to the nearest multiple of `spacing`. */
export function ceilToSpacing(tick: number, spacing: number): number {
  return Math.ceil(tick / spacing) * spacing;
}

/** Exposed for downstream consumers that need the same v4 tick limits. */
export const TICK_BOUNDS = Object.freeze({
  MIN_TICK,
  MAX_TICK,
});
