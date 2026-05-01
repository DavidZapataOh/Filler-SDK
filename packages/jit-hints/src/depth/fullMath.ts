/**
 * Full-precision unsigned integer math, ported from `v4-core/src/libraries/FullMath.sol`.
 *
 * BigInt in JavaScript is arbitrary-precision, so we don't need v4-core's 512-bit
 * intermediate trickery — the multiplication overflow it works around (uint256 ×
 * uint256 → uint512) doesn't apply to BigInt. The only real risk is division-by-zero,
 * which we guard explicitly.
 *
 * Each function mirrors the Solidity name + signature so a reader can map directly
 * between the two.
 */

/**
 * @notice Calculates `floor(a × b / denominator)` with full precision.
 * @throws if `denominator === 0n`.
 */
export function mulDiv(a: bigint, b: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new Error('FullMath: division by zero');
  return (a * b) / denominator;
}

/**
 * @notice Calculates `ceil(a × b / denominator)` with full precision.
 * @throws if `denominator === 0n`.
 */
export function mulDivRoundingUp(a: bigint, b: bigint, denominator: bigint): bigint {
  const q = mulDiv(a, b, denominator);
  return (a * b) % denominator === 0n ? q : q + 1n;
}

/**
 * @notice Multiplies two uint256 modulo 2^256. JavaScript BigInts are unbounded so we
 *         emulate the wrap explicitly. Used by `tickMath` to mirror the bit-shift
 *         multiplication chain in Solidity.
 */
const TWO_POW_256 = 1n << 256n;

export function mulMod256(a: bigint, b: bigint): bigint {
  return (a * b) % TWO_POW_256;
}
