import { describe, expect, test } from 'vitest';

import { pool, position, swap, tick } from '../ponder.schema';

describe('ponder.schema', () => {
  test('exports the four core tables', () => {
    expect(pool).toBeDefined();
    expect(tick).toBeDefined();
    expect(position).toBeDefined();
    expect(swap).toBeDefined();
  });

  test('table objects expose drizzle column accessors', () => {
    // Drizzle attaches a Symbol-keyed config; the public surface is the column getters.
    expect(pool.id).toBeDefined();
    expect(pool.chainId).toBeDefined();
    expect(pool.currency0).toBeDefined();
    expect(pool.currency1).toBeDefined();
    expect(pool.sqrtPriceX96).toBeDefined();

    expect(tick.poolId).toBeDefined();
    expect(tick.tickIdx).toBeDefined();
    expect(tick.liquidityNet).toBeDefined();

    expect(position.owner).toBeDefined();
    expect(position.salt).toBeDefined();

    expect(swap.id).toBeDefined();
    expect(swap.amount0).toBeDefined();
    expect(swap.txHash).toBeDefined();
  });
});
