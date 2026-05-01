import { ponder } from 'ponder:registry';
import { pool, position, swap, tick } from 'ponder:schema';

import { poolEventBus } from '../events/bus';
import { logger } from '../logger';
import {
  computePoolLiquidityAdjustment,
  computePositionUpdate,
  computeTickUpdate,
  swapId,
} from './poolMath';

/**
 * Ponder handlers for the four v4 PoolManager events that the JIT-depth API
 * cares about. Each handler:
 *
 *   1. reads the current row(s) from `context.db`
 *   2. runs pure logic from `poolMath.ts` to compute the next state
 *   3. writes back via `context.db.{insert,update,delete}`
 *   4. emits an event on `poolEventBus` for SSE / live-query subscribers
 *
 * The orchestration layer is intentionally thin — every reasonable invariant
 * lives in pure functions that have unit tests against v4-core's tick math.
 */

ponder.on('PoolManager:Initialize', async ({ event, context }) => {
  const {
    id,
    currency0,
    currency1,
    fee,
    tickSpacing,
    hooks,
    sqrtPriceX96,
    tick: initialTick,
  } = event.args;

  await context.db.insert(pool).values({
    id,
    chainId: context.chain.id,
    currency0,
    currency1,
    fee,
    tickSpacing,
    hooks,
    sqrtPriceX96,
    liquidity: 0n,
    tick: initialTick,
    initializedAt: event.block.number,
    updatedAt: event.block.number,
  });

  logger.info(
    { poolId: id, chainId: context.chain.id, fee, tickSpacing },
    'pool initialized',
  );

  poolEventBus.emit('pool:initialized', {
    poolId: id,
    chainId: context.chain.id,
    blockNumber: event.block.number,
  });
});

ponder.on('PoolManager:ModifyLiquidity', async ({ event, context }) => {
  const {
    id: poolId,
    sender,
    tickLower,
    tickUpper,
    liquidityDelta,
    salt,
  } = event.args;

  // 1) Update tick boundaries.
  await applyTickUpdate(context, poolId, tickLower, liquidityDelta, true);
  await applyTickUpdate(context, poolId, tickUpper, liquidityDelta, false);

  // 2) Update or insert/delete the position row.
  const positionKey = {
    poolId,
    owner: sender,
    tickLower,
    tickUpper,
    salt,
  } as const;
  const existingPos = await context.db.find(position, positionKey);
  const posUpdate = computePositionUpdate(
    existingPos ?? undefined,
    positionKey,
    liquidityDelta,
    event.block.number,
  );
  if (posUpdate.kind === 'insert') {
    await context.db.insert(position).values(posUpdate.row);
  } else if (posUpdate.kind === 'update') {
    await context.db
      .update(position, positionKey)
      .set({ liquidity: posUpdate.row.liquidity, updatedAt: posUpdate.row.updatedAt });
  } else if (posUpdate.kind === 'delete') {
    await context.db.delete(position, positionKey);
  }

  // 3) Adjust pool active liquidity if the range covers the current tick.
  const currentPool = await context.db.find(pool, { id: poolId });
  if (currentPool) {
    const adj = computePoolLiquidityAdjustment(
      currentPool,
      tickLower,
      tickUpper,
      liquidityDelta,
      event.block.number,
    );
    if (adj !== undefined) {
      await context.db.update(pool, { id: poolId }).set(adj);
    }
  }

  poolEventBus.emit('pool:liquidity-changed', {
    poolId,
    chainId: context.chain.id,
    blockNumber: event.block.number,
    liquidityDelta,
  });
});

ponder.on('PoolManager:Swap', async ({ event, context }) => {
  const {
    id: poolId,
    sender,
    amount0,
    amount1,
    sqrtPriceX96,
    liquidity,
    tick: newTick,
    fee,
  } = event.args;

  await context.db.insert(swap).values({
    id: swapId(context.chain.id, event.block.number, event.log.logIndex),
    poolId,
    chainId: context.chain.id,
    sender,
    amount0,
    amount1,
    sqrtPriceX96,
    liquidity,
    tick: newTick,
    fee,
    blockNumber: event.block.number,
    timestamp: event.block.timestamp,
    txHash: event.transaction.hash,
  });

  await context.db
    .update(pool, { id: poolId })
    .set({
      sqrtPriceX96,
      liquidity,
      tick: newTick,
      updatedAt: event.block.number,
    });

  poolEventBus.emit('pool:swap', {
    poolId,
    chainId: context.chain.id,
    blockNumber: event.block.number,
    sqrtPriceX96,
    tick: newTick,
  });
});

ponder.on('PoolManager:Donate', async ({ event, context }) => {
  // Donate doesn't change tick / position liquidity; it credits in-range LPs with
  // fees inside their range. For the JIT-depth API we don't track donate rows
  // — just fan out the event to live subscribers.
  const { id: poolId, amount0, amount1 } = event.args;
  poolEventBus.emit('pool:donate', {
    poolId,
    chainId: context.chain.id,
    blockNumber: event.block.number,
    amount0,
    amount1,
  });
});

/**
 * Read-modify-write a tick row. We keep this helper at the orchestration layer
 * (it touches `context.db`); the math itself is pure in `computeTickUpdate`.
 */
async function applyTickUpdate(
  context: Parameters<Parameters<typeof ponder.on<'PoolManager:ModifyLiquidity'>>[1]>[0]['context'],
  poolId: `0x${string}`,
  tickIdx: number,
  liquidityDelta: bigint,
  isLowerBoundary: boolean,
): Promise<void> {
  const existing = await context.db.find(tick, { poolId, tickIdx });
  const next = computeTickUpdate(
    existing ?? undefined,
    poolId,
    tickIdx,
    liquidityDelta,
    isLowerBoundary,
  );
  if (next === undefined) return;

  if (existing === null || existing === undefined) {
    await context.db.insert(tick).values(next);
  } else {
    await context.db.update(tick, { poolId, tickIdx }).set({
      liquidityGross: next.liquidityGross,
      liquidityNet: next.liquidityNet,
      initialized: next.initialized,
    });
  }
}
