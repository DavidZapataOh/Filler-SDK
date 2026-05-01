import { eq } from 'drizzle-orm';

import type { DepthPool, DepthTick } from '../depth/calculator';

/**
 * Domain-level row types the API surface deals in. Decoupled from Drizzle's
 * `InferSelectModel` typings so route handlers don't reach into the indexer's
 * schema details — easier to mock in tests, easier to evolve the schema
 * independently of the API contract.
 */
export interface PoolRow extends DepthPool {
  chainId: number;
  currency0: `0x${string}`;
  currency1: `0x${string}`;
  hooks: `0x${string}`;
  initializedAt: bigint;
  updatedAt: bigint;
}

export interface ChainStatus {
  chainId: number;
  /** Latest block this chain has indexed up to. `null` when unknown. */
  latestBlock: bigint | null;
  /** Wall-clock timestamp of the last update; `null` when unknown. */
  lastUpdatedAt: bigint | null;
}

export interface PoolListQuery {
  chainId?: number;
  /** Match either `currency0` or `currency1`. */
  token?: `0x${string}`;
  limit: number;
  offset: number;
}

/**
 * Read-only data access used by the HTTP API. Two implementations:
 *  - `createDrizzleDb(...)` — backed by Ponder's `ponder:api` `db` (production).
 *  - `createMockDb(...)`    — in-memory map (tests).
 */
export interface JitHintsDb {
  findPool(id: `0x${string}`): Promise<PoolRow | null>;
  findTicksForPool(poolId: `0x${string}`): Promise<DepthTick[]>;
  queryPools(q: PoolListQuery): Promise<PoolRow[]>;
  chainStatus(): Promise<ChainStatus[]>;
}

// =============================================================================
//                                Mock adapter
// =============================================================================

/**
 * In-memory `JitHintsDb` for tests. Pools and ticks are stored in plain Maps;
 * `chainStatus()` returns whatever was passed in at construction time.
 */
export interface MockDbState {
  pools: PoolRow[];
  ticks: { poolId: `0x${string}`; ticks: DepthTick[] }[];
  chainStatus?: ChainStatus[];
}

export function createMockDb(state: MockDbState): JitHintsDb {
  const poolsById = new Map(state.pools.map((p) => [p.id, p]));
  const ticksByPool = new Map(state.ticks.map((t) => [t.poolId, t.ticks]));

  return {
    async findPool(id) {
      return poolsById.get(id) ?? null;
    },
    async findTicksForPool(poolId) {
      return ticksByPool.get(poolId) ?? [];
    },
    async queryPools({ chainId, token, limit, offset }) {
      let xs = state.pools;
      if (chainId !== undefined) xs = xs.filter((p) => p.chainId === chainId);
      if (token !== undefined) {
        const t = token.toLowerCase();
        xs = xs.filter(
          (p) =>
            p.currency0.toLowerCase() === t || p.currency1.toLowerCase() === t,
        );
      }
      return xs.slice(offset, offset + limit);
    },
    async chainStatus() {
      return state.chainStatus ?? [];
    },
  };
}

// =============================================================================
//                              Drizzle adapter
// =============================================================================

/**
 * Production adapter: queries Ponder's read-only Drizzle handle.
 *
 * The schema imports are passed in (rather than imported from `ponder:schema`
 * here) so this module remains testable WITHOUT bringing the Ponder virtual
 * resolution into the test runtime.
 */
export interface DrizzleSchema {
  // We intentionally keep these `any` here — the public-facing types are on
  // `JitHintsDb`. Internally, drizzle queries against unknown table shapes
  // need a structural escape hatch; the schema is enforced at the call site.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pool: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tick: any;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createDrizzleDb(db: any, schema: DrizzleSchema): JitHintsDb {
  return {
    async findPool(id) {
      const rows = await db.select().from(schema.pool).where(eq(schema.pool.id, id)).limit(1);
      const row = rows[0];
      return row ? (row as PoolRow) : null;
    },
    async findTicksForPool(poolId) {
      const rows = await db
        .select()
        .from(schema.tick)
        .where(eq(schema.tick.poolId, poolId));
      return rows.map((r: { tickIdx: number; liquidityNet: bigint; liquidityGross: bigint }) => ({
        tickIdx: r.tickIdx,
        liquidityNet: r.liquidityNet,
        liquidityGross: r.liquidityGross,
      }));
    },
    async queryPools({ chainId, token, limit, offset }) {
      // Drizzle's typed query API; we apply filters incrementally.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = db.select().from(schema.pool) as any;
      if (chainId !== undefined) q = q.where(eq(schema.pool.chainId, chainId));
      const all = (await q) as PoolRow[];
      const filtered = token === undefined
        ? all
        : all.filter(
            (p) =>
              p.currency0.toLowerCase() === token.toLowerCase() ||
              p.currency1.toLowerCase() === token.toLowerCase(),
          );
      return filtered.slice(offset, offset + limit);
    },
    async chainStatus() {
      // Ponder's status endpoint isn't trivially exposed via Drizzle; the API
      // returns an empty array by default and the operator can layer in a
      // real implementation when wiring the production server. Plan 08
      // (Observability) builds on this with a chain-tip checkpoint table.
      return [];
    },
  };
}
