import { describe, expect, test } from 'vitest';

import {
  computePoolLiquidityAdjustment,
  computePositionUpdate,
  computeTickUpdate,
  rangeCoversCurrentTick,
  swapId,
} from '../src/handlers/poolMath';

const POOL: `0x${string}` = '0x1111111111111111111111111111111111111111111111111111111111111111';
const OWNER: `0x${string}` = '0x2222222222222222222222222222222222222222';
const SALT: `0x${string}` = '0x0000000000000000000000000000000000000000000000000000000000000000';

describe('computeTickUpdate', () => {
  test('first touch with positive delta inserts a row at lower boundary', () => {
    const next = computeTickUpdate(undefined, POOL, -60, 100n, true);
    expect(next).toEqual({
      poolId: POOL,
      tickIdx: -60,
      liquidityGross: 100n,
      liquidityNet: 100n,
      initialized: true,
    });
  });

  test('first touch with positive delta at upper boundary flips netContribution sign', () => {
    const next = computeTickUpdate(undefined, POOL, 60, 100n, false);
    expect(next).toEqual({
      poolId: POOL,
      tickIdx: 60,
      liquidityGross: 100n,
      liquidityNet: -100n,
      initialized: true,
    });
  });

  test('first touch with non-positive delta is a no-op', () => {
    expect(computeTickUpdate(undefined, POOL, 0, 0n, true)).toBeUndefined();
    expect(computeTickUpdate(undefined, POOL, 0, -50n, true)).toBeUndefined();
  });

  test('add to existing tick increases gross + adjusts net', () => {
    const existing = {
      poolId: POOL,
      tickIdx: -60,
      liquidityGross: 100n,
      liquidityNet: 100n,
      initialized: true,
    };
    const next = computeTickUpdate(existing, POOL, -60, 50n, true);
    expect(next).toEqual({
      ...existing,
      liquidityGross: 150n,
      liquidityNet: 150n,
    });
  });

  test('remove from existing tick decreases gross + adjusts net', () => {
    const existing = {
      poolId: POOL,
      tickIdx: -60,
      liquidityGross: 100n,
      liquidityNet: 100n,
      initialized: true,
    };
    const next = computeTickUpdate(existing, POOL, -60, -40n, true);
    expect(next).toEqual({
      ...existing,
      liquidityGross: 60n,
      liquidityNet: 60n,
    });
  });

  test('remove that drains gross marks tick uninitialized', () => {
    const existing = {
      poolId: POOL,
      tickIdx: 60,
      liquidityGross: 50n,
      liquidityNet: -50n,
      initialized: true,
    };
    const next = computeTickUpdate(existing, POOL, 60, -50n, false);
    expect(next?.liquidityGross).toBe(0n);
    expect(next?.liquidityNet).toBe(0n);
    expect(next?.initialized).toBe(false);
  });
});

describe('computePositionUpdate', () => {
  const positionKey = {
    poolId: POOL,
    owner: OWNER,
    tickLower: -60,
    tickUpper: 60,
    salt: SALT,
  } as const;

  test('insert when no existing row and delta is positive', () => {
    const upd = computePositionUpdate(undefined, positionKey, 100n, 42n);
    expect(upd.kind).toBe('insert');
    if (upd.kind === 'insert') {
      expect(upd.row.liquidity).toBe(100n);
      expect(upd.row.updatedAt).toBe(42n);
      expect(upd.row.owner).toBe(OWNER);
    }
  });

  test('noop when no existing row and delta non-positive', () => {
    expect(computePositionUpdate(undefined, positionKey, 0n, 1n).kind).toBe('noop');
    expect(computePositionUpdate(undefined, positionKey, -1n, 1n).kind).toBe('noop');
  });

  test('update when existing row and resulting liquidity is positive', () => {
    const existing = {
      ...positionKey,
      liquidity: 200n,
      updatedAt: 10n,
    };
    const upd = computePositionUpdate(existing, positionKey, -50n, 99n);
    expect(upd.kind).toBe('update');
    if (upd.kind === 'update') {
      expect(upd.row.liquidity).toBe(150n);
      expect(upd.row.updatedAt).toBe(99n);
    }
  });

  test('delete when existing row and resulting liquidity is zero', () => {
    const existing = {
      ...positionKey,
      liquidity: 100n,
      updatedAt: 10n,
    };
    const upd = computePositionUpdate(existing, positionKey, -100n, 99n);
    expect(upd.kind).toBe('delete');
  });

  test('noop when delta would underflow existing liquidity', () => {
    const existing = {
      ...positionKey,
      liquidity: 50n,
      updatedAt: 10n,
    };
    const upd = computePositionUpdate(existing, positionKey, -100n, 99n);
    expect(upd.kind).toBe('noop');
  });
});

describe('rangeCoversCurrentTick', () => {
  test('range is half-open: lower inclusive', () => {
    expect(rangeCoversCurrentTick({ tick: -60 }, -60, 60)).toBe(true);
  });

  test('range is half-open: upper exclusive', () => {
    expect(rangeCoversCurrentTick({ tick: 60 }, -60, 60)).toBe(false);
  });

  test('current tick well inside range', () => {
    expect(rangeCoversCurrentTick({ tick: 0 }, -60, 60)).toBe(true);
  });

  test('current tick below range', () => {
    expect(rangeCoversCurrentTick({ tick: -120 }, -60, 60)).toBe(false);
  });

  test('current tick above range', () => {
    expect(rangeCoversCurrentTick({ tick: 120 }, -60, 60)).toBe(false);
  });
});

describe('computePoolLiquidityAdjustment', () => {
  const basePool = {
    id: POOL,
    liquidity: 1_000n,
    tick: 0,
    updatedAt: 1n,
  };

  test('adjusts when range covers current tick', () => {
    const adj = computePoolLiquidityAdjustment(basePool, -60, 60, 250n, 100n);
    expect(adj).toEqual({ liquidity: 1_250n, updatedAt: 100n });
  });

  test('returns undefined when range does not cover current tick', () => {
    expect(computePoolLiquidityAdjustment(basePool, 60, 120, 250n, 100n)).toBeUndefined();
  });

  test('clamps liquidity at zero on underflow (defensive)', () => {
    const adj = computePoolLiquidityAdjustment(basePool, -60, 60, -2_000n, 100n);
    expect(adj).toEqual({ liquidity: 0n, updatedAt: 100n });
  });
});

describe('swapId', () => {
  test('produces a stable string from chainId + block + log index', () => {
    expect(swapId(1, 21_000_000n, 7)).toBe('1-21000000-7');
    expect(swapId(130, 1n, 0)).toBe('130-1-0');
  });

  test('different inputs produce different ids', () => {
    expect(swapId(1, 1n, 0)).not.toBe(swapId(1, 1n, 1));
    expect(swapId(1, 1n, 0)).not.toBe(swapId(2, 1n, 0));
  });
});
