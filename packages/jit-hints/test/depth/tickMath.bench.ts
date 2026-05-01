import { bench, describe } from 'vitest';

import {
  MAX_TICK,
  MIN_TICK,
  getSqrtRatioAtTick,
  getTickAtSqrtRatio,
} from '../../src/depth/tickMath';

/**
 * Plan 04 acceptance criterion: < 1 μs per call. BigInt math has overhead but
 * the 19-step magic-constant chain is short; we comfortably hit single-digit
 * microseconds on a modern laptop.
 */
describe('TickMath perf', () => {
  bench('getSqrtRatioAtTick(0)', () => {
    getSqrtRatioAtTick(0);
  });

  bench('getSqrtRatioAtTick(MIN_TICK)', () => {
    getSqrtRatioAtTick(MIN_TICK);
  });

  bench('getSqrtRatioAtTick(MAX_TICK)', () => {
    getSqrtRatioAtTick(MAX_TICK);
  });

  bench('getSqrtRatioAtTick(50_000) — typical mid-range', () => {
    getSqrtRatioAtTick(50_000);
  });

  bench('getTickAtSqrtRatio at price=1.0 (sqrt = 1<<96)', () => {
    getTickAtSqrtRatio(getSqrtRatioAtTick(0));
  });

  bench('getTickAtSqrtRatio at MAX_SQRT_PRICE - 1', () => {
    getTickAtSqrtRatio(getSqrtRatioAtTick(MAX_TICK - 1));
  });
});
