/**
 * Pure business logic for v4 PoolManager event handling.
 *
 * Each function here is a pure transition: given the current row state + the event
 * args, returns the next state. No Ponder context, no DB, no I/O — testable in
 * isolation against v4-core's tick math.
 *
 * The handlers in `src/handlers/PoolManager.ts` are thin orchestrators that read
 * the current state from `context.db`, call into these functions, and write the
 * results back. Keeping the math pure means we can prove correctness against
 * v4-core test vectors without simulating Ponder's runtime.
 */

export interface TickRow {
  poolId: `0x${string}`;
  tickIdx: number;
  liquidityGross: bigint;
  liquidityNet: bigint;
  initialized: boolean;
}

export interface PositionRow {
  poolId: `0x${string}`;
  owner: `0x${string}`;
  tickLower: number;
  tickUpper: number;
  salt: `0x${string}`;
  liquidity: bigint;
  updatedAt: bigint;
}

export interface PoolRow {
  id: `0x${string}`;
  liquidity: bigint;
  tick: number;
}

/**
 * Compute the next state of a tick row when liquidity is added/removed.
 *
 * v4-core semantics (Pool.sol#L153):
 *   - `liquidityGross` always grows by `|delta|` (it's the unsigned magnitude).
 *   - `liquidityNet` adds `+delta` at the lower tick (entering the range)
 *     and `-delta` at the upper tick (leaving the range).
 *   - `initialized` is true iff `liquidityGross > 0`.
 *
 * @param existing the row currently in the DB, or `undefined` if first touch
 * @param delta `liquidityDelta` from the event (signed; negative on remove)
 * @param isLowerBoundary `true` for the lower tick, `false` for the upper
 */
export function computeTickUpdate(
  existing: TickRow | undefined,
  poolId: `0x${string}`,
  tickIdx: number,
  delta: bigint,
  isLowerBoundary: boolean,
): TickRow | undefined {
  const absDelta = delta < 0n ? -delta : delta;
  const netContribution = isLowerBoundary ? delta : -delta;

  if (existing === undefined) {
    // Touching this tick for the first time. Only meaningful if delta > 0.
    if (delta <= 0n) return undefined;
    return {
      poolId,
      tickIdx,
      liquidityGross: absDelta,
      liquidityNet: netContribution,
      initialized: true,
    };
  }

  // delta > 0 → adding liquidity → gross += |delta|.
  // delta < 0 → removing liquidity → gross -= |delta|.
  const newGross =
    delta > 0n ? existing.liquidityGross + absDelta : existing.liquidityGross - absDelta;
  const newNet = existing.liquidityNet + netContribution;
  return {
    ...existing,
    liquidityGross: newGross,
    liquidityNet: newNet,
    initialized: newGross > 0n,
  };
}

export type PositionUpdate =
  | { kind: 'insert'; row: PositionRow }
  | { kind: 'update'; row: PositionRow }
  | { kind: 'delete' }
  | { kind: 'noop' };

/**
 * Compute what to do with a position row given a `liquidityDelta`.
 *
 * Cases:
 *   - existing && newLiquidity > 0  → update
 *   - existing && newLiquidity == 0 → delete
 *   - existing && newLiquidity < 0  → noop (defensive — would underflow on-chain)
 *   - !existing && delta > 0        → insert
 *   - !existing && delta <= 0       → noop (no-op; the on-chain modify reverted or the
 *                                            event is for a position never tracked here)
 */
export function computePositionUpdate(
  existing: PositionRow | undefined,
  positionKey: {
    poolId: `0x${string}`;
    owner: `0x${string}`;
    tickLower: number;
    tickUpper: number;
    salt: `0x${string}`;
  },
  liquidityDelta: bigint,
  blockNumber: bigint,
): PositionUpdate {
  if (existing === undefined) {
    if (liquidityDelta <= 0n) return { kind: 'noop' };
    return {
      kind: 'insert',
      row: {
        ...positionKey,
        liquidity: liquidityDelta,
        updatedAt: blockNumber,
      },
    };
  }

  const next = existing.liquidity + liquidityDelta;
  if (next < 0n) return { kind: 'noop' };
  if (next === 0n) return { kind: 'delete' };
  return {
    kind: 'update',
    row: {
      ...existing,
      liquidity: next,
      updatedAt: blockNumber,
    },
  };
}

/**
 * Decide whether a `ModifyLiquidity` event impacts the pool's "active" liquidity
 * (the liquidity covering the current tick).
 *
 * v4-core convention: a position's range `[tickLower, tickUpper)` is half-open
 * (lower inclusive, upper exclusive). If the current tick falls inside the range,
 * the position contributes to active liquidity.
 */
export function rangeCoversCurrentTick(
  pool: Pick<PoolRow, 'tick'>,
  tickLower: number,
  tickUpper: number,
): boolean {
  return tickLower <= pool.tick && pool.tick < tickUpper;
}

/**
 * Apply `liquidityDelta` to a pool row's `liquidity` field iff the range covers the
 * current tick. Returns the next pool state (with `liquidity` adjusted), or
 * `undefined` to signal "no update needed."
 */
export function computePoolLiquidityAdjustment(
  pool: PoolRow & { updatedAt: bigint },
  tickLower: number,
  tickUpper: number,
  liquidityDelta: bigint,
  blockNumber: bigint,
): { liquidity: bigint; updatedAt: bigint } | undefined {
  if (!rangeCoversCurrentTick(pool, tickLower, tickUpper)) return undefined;
  const next = pool.liquidity + liquidityDelta;
  // Defensive: pool liquidity is uint128 on-chain; clamp at zero to mirror it.
  return {
    liquidity: next < 0n ? 0n : next,
    updatedAt: blockNumber,
  };
}

/**
 * Build the deterministic primary-key string for a swap row.
 * Format: `<chainId>-<blockNumber>-<logIndex>`. Stable across reorgs because Ponder
 * re-applies indexing functions at the same block + log index.
 */
export function swapId(
  chainId: number,
  blockNumber: bigint,
  logIndex: number,
): string {
  return `${chainId}-${blockNumber.toString()}-${logIndex}`;
}
