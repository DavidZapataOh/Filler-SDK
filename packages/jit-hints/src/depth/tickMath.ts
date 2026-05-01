/**
 * `TickMath` — Solidity port of `v4-core/src/libraries/TickMath.sol`.
 *
 * This module implements the canonical Uniswap v3/v4 tick ↔ sqrtPrice conversion
 * with the same magic constants the Solidity library uses. JavaScript `BigInt` is
 * arbitrary-precision so the Solidity unchecked-uint256 multiplications need
 * explicit modulo-2^256 wrapping at the spots where the Solidity intentionally
 * wraps (the `mul(r, r)` lines inside the `getTickAtSqrtPrice` log-finding loop).
 *
 * Plan 03 ships this minimal port. Plan 04 (`04-tick-math-port.md`) audits the
 * implementation against v4-core's own test fixtures and adds property-based
 * tests; the public surface here is what Plan 04 will exercise.
 *
 * IMPORTANT: this code is reachable from off-chain solver code paths that decide
 * whether a fill is profitable. A bug here = filler executes losing trades.
 * Treat changes with the same rigor as the on-chain contract.
 */

import { mulMod256 } from './fullMath';

// ============ Constants ============

/** Minimum tick that may be passed to `getSqrtRatioAtTick`. Matches v4-core. */
export const MIN_TICK = -887272;

/** Maximum tick that may be passed to `getSqrtRatioAtTick`. Matches v4-core. */
export const MAX_TICK = 887272;

/** Minimum sqrt-price returned by `getSqrtRatioAtTick` (= price at MIN_TICK). */
export const MIN_SQRT_PRICE = 4_295_128_739n;

/** Maximum sqrt-price returned by `getSqrtRatioAtTick` (= price at MAX_TICK). */
export const MAX_SQRT_PRICE = 1_461_446_703_485_210_103_287_273_052_203_988_822_378_723_970_342n;

const TWO_POW_128 = 1n << 128n;
const TWO_POW_256_MINUS_1 = (1n << 256n) - 1n;

// ============ getSqrtRatioAtTick ============

/**
 * Returns floor(sqrt(1.0001^tick) × 2^96) for the given tick.
 *
 * Mirrors v4-core's `getSqrtPriceAtTick`. Throws if `tick` is outside
 * `[MIN_TICK, MAX_TICK]`.
 */
export function getSqrtRatioAtTick(tick: number): bigint {
  if (!Number.isInteger(tick)) {
    throw new Error(`TickMath.getSqrtRatioAtTick: non-integer tick ${tick}`);
  }
  const absTick = tick < 0 ? -tick : tick;
  if (absTick > MAX_TICK) {
    throw new Error(`TickMath.getSqrtRatioAtTick: tick ${tick} out of bounds`);
  }

  const at = BigInt(absTick);

  // The starting price is 1<<128 if the lowest bit of absTick is 0, otherwise
  // it's the canonical "1/sqrt(1.0001)" Q128.128 magic constant.
  let price =
    (at & 0x1n) !== 0n
      ? 0xfffcb933bd6fad37aa2d162d1a594001n
      : TWO_POW_128;

  if ((at & 0x2n) !== 0n) price = (price * 0xfff97272373d413259a46990580e213an) >> 128n;
  if ((at & 0x4n) !== 0n) price = (price * 0xfff2e50f5f656932ef12357cf3c7fdccn) >> 128n;
  if ((at & 0x8n) !== 0n) price = (price * 0xffe5caca7e10e4e61c3624eaa0941cd0n) >> 128n;
  if ((at & 0x10n) !== 0n) price = (price * 0xffcb9843d60f6159c9db58835c926644n) >> 128n;
  if ((at & 0x20n) !== 0n) price = (price * 0xff973b41fa98c081472e6896dfb254c0n) >> 128n;
  if ((at & 0x40n) !== 0n) price = (price * 0xff2ea16466c96a3843ec78b326b52861n) >> 128n;
  if ((at & 0x80n) !== 0n) price = (price * 0xfe5dee046a99a2a811c461f1969c3053n) >> 128n;
  if ((at & 0x100n) !== 0n) price = (price * 0xfcbe86c7900a88aedcffc83b479aa3a4n) >> 128n;
  if ((at & 0x200n) !== 0n) price = (price * 0xf987a7253ac413176f2b074cf7815e54n) >> 128n;
  if ((at & 0x400n) !== 0n) price = (price * 0xf3392b0822b70005940c7a398e4b70f3n) >> 128n;
  if ((at & 0x800n) !== 0n) price = (price * 0xe7159475a2c29b7443b29c7fa6e889d9n) >> 128n;
  if ((at & 0x1000n) !== 0n) price = (price * 0xd097f3bdfd2022b8845ad8f792aa5825n) >> 128n;
  if ((at & 0x2000n) !== 0n) price = (price * 0xa9f746462d870fdf8a65dc1f90e061e5n) >> 128n;
  if ((at & 0x4000n) !== 0n) price = (price * 0x70d869a156d2a1b890bb3df62baf32f7n) >> 128n;
  if ((at & 0x8000n) !== 0n) price = (price * 0x31be135f97d08fd981231505542fcfa6n) >> 128n;
  if ((at & 0x10000n) !== 0n) price = (price * 0x9aa508b5b7a84e1c677de54f3e99bc9n) >> 128n;
  if ((at & 0x20000n) !== 0n) price = (price * 0x5d6af8dedb81196699c329225ee604n) >> 128n;
  if ((at & 0x40000n) !== 0n) price = (price * 0x2216e584f5fa1ea926041bedfe98n) >> 128n;
  if ((at & 0x80000n) !== 0n) price = (price * 0x48a170391f7dc42444e8fa2n) >> 128n;

  // For positive ticks, the on-chain code computes the reciprocal:
  //   if (tick > 0) price = type(uint256).max / price
  if (tick > 0) price = TWO_POW_256_MINUS_1 / price;

  // Convert from Q128.128 to Q64.96 by shifting right 32, rounding UP. Matches
  // the Solidity:  shr(32, add(price, sub(shl(32, 1), 1)))
  const sqrtPriceX96 = (price + 0xffff_ffffn) >> 32n;
  return sqrtPriceX96;
}

// ============ getTickAtSqrtRatio ============

/**
 * Returns the greatest tick `t` such that `getSqrtRatioAtTick(t) <= sqrtPriceX96`.
 *
 * Mirrors v4-core's `getTickAtSqrtPrice`. Throws if the input is outside
 * `[MIN_SQRT_PRICE, MAX_SQRT_PRICE)`.
 */
export function getTickAtSqrtRatio(sqrtPriceX96: bigint): number {
  if (sqrtPriceX96 < MIN_SQRT_PRICE || sqrtPriceX96 >= MAX_SQRT_PRICE) {
    throw new Error(
      `TickMath.getTickAtSqrtRatio: sqrtPriceX96 ${sqrtPriceX96} out of bounds`,
    );
  }

  // Lift Q64.96 to Q128.128 by shifting left 32.
  const price = sqrtPriceX96 << 32n;
  let r = price;
  const msb = mostSignificantBit(r);

  if (msb >= 128) r = price >> BigInt(msb - 127);
  else r = price << BigInt(127 - msb);

  let log_2 = (BigInt(msb) - 128n) << 64n;

  // 14-iteration bit-finding loop. Each iteration:
  //   r = (r * r) wrapped-mod-2^256 then shifted right 127
  //   f = r >> 128 (0 or 1)
  //   log_2 |= f << (63 - i)
  //   r >>= f
  for (let i = 0; i < 14; i++) {
    r = mulMod256(r, r) >> 127n;
    const f = r >> 128n;
    log_2 |= f << BigInt(63 - i);
    r >>= f;
  }

  // log_sqrt10001 = log_2 * 255738958999603826347141 (Q22.128)
  const log_sqrt10001 = log_2 * 255_738_958_999_603_826_347_141n;

  // The two magic numbers below are the worst-case rounding-error bounds when
  // approximating log_sqrt(1.0001)(x). Either of `tickLow` and `tickHi` is the
  // correct answer; we tie-break by checking which actually satisfies the
  // monotonicity requirement.
  const tickLow = Number(
    (log_sqrt10001 - 3_402_992_956_809_132_418_596_140_100_660_247_210n) >> 128n,
  );
  const tickHi = Number(
    (log_sqrt10001 + 291_339_464_771_989_622_907_027_621_153_398_088_495n) >> 128n,
  );

  if (tickLow === tickHi) return tickLow;
  return getSqrtRatioAtTick(tickHi) <= sqrtPriceX96 ? tickHi : tickLow;
}

// ============ Internal: BitMath.mostSignificantBit ============

function mostSignificantBit(x: bigint): number {
  if (x <= 0n) throw new Error('TickMath: mostSignificantBit on non-positive');
  let r = 0;
  if (x >= 1n << 128n) {
    x >>= 128n;
    r += 128;
  }
  if (x >= 1n << 64n) {
    x >>= 64n;
    r += 64;
  }
  if (x >= 1n << 32n) {
    x >>= 32n;
    r += 32;
  }
  if (x >= 1n << 16n) {
    x >>= 16n;
    r += 16;
  }
  if (x >= 1n << 8n) {
    x >>= 8n;
    r += 8;
  }
  if (x >= 1n << 4n) {
    x >>= 4n;
    r += 4;
  }
  if (x >= 1n << 2n) {
    x >>= 2n;
    r += 2;
  }
  if (x >= 1n << 1n) {
    r += 1;
  }
  return r;
}
