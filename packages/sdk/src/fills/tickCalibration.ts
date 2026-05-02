/**
 * `calibrateTickRange` — turns an indexer depth hint into a validated
 * `(tickLower, tickUpper, liquidityDelta)` triple.
 *
 * **Plan 04 ships the pass-through + invariant validator.** Plan 05 will
 * replace the body with the real calibration math (sqrt-price → optimal tick
 * range given pool curvature + slippage budget). The Plan 05 swap is a
 * single-file change — the function signature is locked here.
 *
 * Why ship the pass-through now: the FillEngine's `prepare` needs SOMETHING
 * callable that produces validated ticks. The indexer's hint already carries
 * a usable triple; calibration just refines it. Skipping the refinement step
 * for v0 is a known approximation, not a bug — the on-chain
 * `FillParamsLib.validate()` enforces the invariants regardless.
 *
 * Validation (always enforced):
 *   - tickLower < tickUpper
 *   - both within [MIN_TICK, MAX_TICK] (`-887272 ≤ t ≤ 887272`)
 *   - both divisible by `pool.tickSpacing`
 *   - liquidityDelta > 0
 *
 * On any invariant failure, throws `FillerError(INSUFFICIENT_LIQUIDITY)` so
 * the FillEngine can convert it into a clean `prepare → null` for the caller.
 */

import { InsufficientLiquidityError } from '../errors';
import type { DepthHint, Intent, PoolInfo } from '../types';

// v4 tick limits — `TickMath.MIN_TICK` / `MAX_TICK`. Mirrored from
// contracts/lib/v4-core/src/libraries/TickMath.sol.
const MIN_TICK = -887_272;
const MAX_TICK = 887_272;

export interface CalibratedRange {
  tickLower: number;
  tickUpper: number;
  liquidityDelta: bigint;
}

export interface CalibrateInput {
  pool: PoolInfo;
  hint: DepthHint;
  intent: Intent;
}

/**
 * Pass-through calibration with validation. Plan 05 fills in the math; for
 * Plan 04 we trust the indexer's hint and only enforce the on-chain invariants
 * client-side (so we fail fast instead of paying gas to revert on chain).
 */
export function calibrateTickRange(input: CalibrateInput): CalibratedRange {
  const { pool, hint } = input;
  const { tickLower, tickUpper, liquidityDelta } = hint.hint;

  if (!Number.isInteger(tickLower) || !Number.isInteger(tickUpper)) {
    throw new InsufficientLiquidityError(
      `non-integer ticks from indexer: ${tickLower}, ${tickUpper}`,
      { context: { poolId: pool.id } },
    );
  }
  if (tickLower >= tickUpper) {
    throw new InsufficientLiquidityError(
      `tickLower (${tickLower}) must be < tickUpper (${tickUpper})`,
      { context: { poolId: pool.id } },
    );
  }
  if (tickLower < MIN_TICK || tickUpper > MAX_TICK) {
    throw new InsufficientLiquidityError(
      `tick range out of bounds: [${tickLower}, ${tickUpper}]`,
      { context: { poolId: pool.id, MIN_TICK, MAX_TICK } },
    );
  }
  if (
    tickLower % pool.tickSpacing !== 0 ||
    tickUpper % pool.tickSpacing !== 0
  ) {
    throw new InsufficientLiquidityError(
      `ticks not aligned to spacing ${pool.tickSpacing}: [${tickLower}, ${tickUpper}]`,
      { context: { poolId: pool.id } },
    );
  }
  if (liquidityDelta <= 0n) {
    throw new InsufficientLiquidityError(
      `non-positive liquidityDelta: ${liquidityDelta.toString()}`,
      { context: { poolId: pool.id } },
    );
  }

  return { tickLower, tickUpper, liquidityDelta };
}
