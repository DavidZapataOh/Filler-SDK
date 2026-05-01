import { index, onchainTable, primaryKey, relations } from 'ponder';

/**
 * v4 indexer schema.
 *
 * Four core tables:
 *   - `pool`     — every pool ever initialized (one row per `Initialize` event)
 *   - `tick`     — initialized tick liquidity per pool (updated on `ModifyLiquidity`)
 *   - `position` — LP positions keyed by (pool, owner, range, salt)
 *   - `swap`     — swap history (one row per `Swap` event)
 *
 * Field naming mirrors the v4-core ABI verbatim where possible so off-chain code
 * can map event payloads directly into rows without renames.
 *
 * Indexes are tuned for the queries the SDK + dashboard will run:
 *   - "fetch pools by (chain, currencies)" → composite index on `pool`
 *   - "fetch ticks for a pool" → leading index on `tick.poolId`
 *   - "fetch swaps in a pool over a time window" → composite (poolId, timestamp)
 */

export const pool = onchainTable(
  'pool',
  (t) => ({
    id: t.hex().primaryKey(), // poolId = keccak256(abi.encode(PoolKey))
    chainId: t.integer().notNull(),
    currency0: t.hex().notNull(),
    currency1: t.hex().notNull(),
    fee: t.integer().notNull(),
    tickSpacing: t.integer().notNull(),
    hooks: t.hex().notNull(),
    sqrtPriceX96: t.bigint().notNull(),
    liquidity: t.bigint().notNull(),
    tick: t.integer().notNull(),
    initializedAt: t.bigint().notNull(),
    updatedAt: t.bigint().notNull(),
  }),
  (t) => ({
    chainCurrenciesIdx: index().on(t.chainId, t.currency0, t.currency1),
    hooksIdx: index().on(t.hooks),
  }),
);

export const tick = onchainTable(
  'tick',
  (t) => ({
    poolId: t.hex().notNull(),
    tickIdx: t.integer().notNull(),
    liquidityGross: t.bigint().notNull(),
    liquidityNet: t.bigint().notNull(),
    initialized: t.boolean().notNull(),
  }),
  (t) => ({
    pk: primaryKey({ columns: [t.poolId, t.tickIdx] }),
    poolIdx: index().on(t.poolId),
  }),
);

export const position = onchainTable(
  'position',
  (t) => ({
    poolId: t.hex().notNull(),
    owner: t.hex().notNull(),
    tickLower: t.integer().notNull(),
    tickUpper: t.integer().notNull(),
    salt: t.hex().notNull(),
    liquidity: t.bigint().notNull(),
    updatedAt: t.bigint().notNull(),
  }),
  (t) => ({
    pk: primaryKey({
      columns: [t.poolId, t.owner, t.tickLower, t.tickUpper, t.salt],
    }),
    poolOwnerIdx: index().on(t.poolId, t.owner),
  }),
);

export const swap = onchainTable(
  'swap',
  (t) => ({
    id: t.text().primaryKey(), // `${chainId}-${blockNumber}-${logIndex}`
    poolId: t.hex().notNull(),
    chainId: t.integer().notNull(),
    sender: t.hex().notNull(),
    amount0: t.bigint().notNull(),
    amount1: t.bigint().notNull(),
    sqrtPriceX96: t.bigint().notNull(),
    liquidity: t.bigint().notNull(),
    tick: t.integer().notNull(),
    fee: t.integer().notNull(),
    blockNumber: t.bigint().notNull(),
    timestamp: t.bigint().notNull(),
    txHash: t.hex().notNull(),
  }),
  (t) => ({
    poolTimestampIdx: index().on(t.poolId, t.timestamp),
    blockIdx: index().on(t.blockNumber),
    chainBlockIdx: index().on(t.chainId, t.blockNumber),
  }),
);

// Retention policy — keep the swap table from growing unbounded. Implemented as a
// scheduled cleanup job in Plan 08 (Observability), not in the schema itself.

export const poolRelations = relations(pool, ({ many }) => ({
  ticks: many(tick),
  positions: many(position),
  swaps: many(swap),
}));

export const tickRelations = relations(tick, ({ one }) => ({
  pool: one(pool, { fields: [tick.poolId], references: [pool.id] }),
}));

export const positionRelations = relations(position, ({ one }) => ({
  pool: one(pool, { fields: [position.poolId], references: [pool.id] }),
}));

export const swapRelations = relations(swap, ({ one }) => ({
  pool: one(pool, { fields: [swap.poolId], references: [pool.id] }),
}));
