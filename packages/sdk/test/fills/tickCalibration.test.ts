import { describe, expect, test } from 'vitest';

import { InsufficientLiquidityError } from '../../src';
import { calibrateTickRange } from '../../src/fills/tickCalibration';
import { makeDepthHint, makeIntent, makePoolInfo } from './fixtures';

describe('calibrateTickRange (Plan 04 pass-through; Plan 05 fills math)', () => {
  test('returns the indexer hint when invariants pass', () => {
    const r = calibrateTickRange({
      pool: makePoolInfo(),
      hint: makeDepthHint({ tickLower: -120, tickUpper: 120 }),
      intent: makeIntent(),
    });
    expect(r).toEqual({
      tickLower: -120,
      tickUpper: 120,
      liquidityDelta: 1_000_000_000_000n,
    });
  });

  test('rejects tickLower >= tickUpper', () => {
    expect(() =>
      calibrateTickRange({
        pool: makePoolInfo(),
        hint: makeDepthHint({ tickLower: 120, tickUpper: -120 }),
        intent: makeIntent(),
      }),
    ).toThrow(InsufficientLiquidityError);
  });

  test('rejects ticks not aligned to spacing', () => {
    expect(() =>
      calibrateTickRange({
        pool: makePoolInfo({ tickSpacing: 60 }),
        hint: makeDepthHint({ tickLower: -119, tickUpper: 120 }),
        intent: makeIntent(),
      }),
    ).toThrow(/spacing/);
  });

  test('rejects ticks out of [MIN_TICK, MAX_TICK] range', () => {
    expect(() =>
      calibrateTickRange({
        pool: makePoolInfo({ tickSpacing: 1 }),
        hint: makeDepthHint({ tickLower: -1_000_000, tickUpper: 100 }),
        intent: makeIntent(),
      }),
    ).toThrow(/out of bounds/);
  });

  test('rejects liquidityDelta <= 0', () => {
    expect(() =>
      calibrateTickRange({
        pool: makePoolInfo(),
        hint: makeDepthHint({ liquidityDelta: 0n }),
        intent: makeIntent(),
      }),
    ).toThrow(/non-positive/);
  });

  test('accepts ticks aligned to a custom tickSpacing', () => {
    const r = calibrateTickRange({
      pool: makePoolInfo({ tickSpacing: 200 }),
      hint: makeDepthHint({ tickLower: -400, tickUpper: 600 }),
      intent: makeIntent(),
    });
    expect(r.tickLower).toBe(-400);
    expect(r.tickUpper).toBe(600);
  });
});
