import { describe, expect, test } from 'vitest';

import {
  MAX_SQRT_PRICE,
  MAX_TICK,
  MIN_SQRT_PRICE,
  MIN_TICK,
  getSqrtRatioAtTick,
  getTickAtSqrtRatio,
} from '../../src/depth/tickMath';

describe('TickMath constants', () => {
  test('MIN_TICK / MAX_TICK match v4-core', () => {
    expect(MIN_TICK).toBe(-887_272);
    expect(MAX_TICK).toBe(887_272);
  });

  test('MIN_SQRT_PRICE / MAX_SQRT_PRICE match v4-core', () => {
    expect(MIN_SQRT_PRICE).toBe(4_295_128_739n);
    expect(MAX_SQRT_PRICE).toBe(
      1_461_446_703_485_210_103_287_273_052_203_988_822_378_723_970_342n,
    );
  });
});

describe('getSqrtRatioAtTick — known values', () => {
  // Reference values from v4-core / v3 SDK fixtures.
  test('tick 0 → 1 << 96 (price = 1.0)', () => {
    expect(getSqrtRatioAtTick(0)).toBe(79_228_162_514_264_337_593_543_950_336n);
  });

  test('tick MIN_TICK → MIN_SQRT_PRICE', () => {
    expect(getSqrtRatioAtTick(MIN_TICK)).toBe(MIN_SQRT_PRICE);
  });

  test('tick MAX_TICK → MAX_SQRT_PRICE', () => {
    expect(getSqrtRatioAtTick(MAX_TICK)).toBe(MAX_SQRT_PRICE);
  });

  test('tick is monotone increasing', () => {
    let last = 0n;
    for (const t of [-100_000, -1_000, -100, -1, 0, 1, 100, 1_000, 100_000]) {
      const v = getSqrtRatioAtTick(t);
      expect(v).toBeGreaterThan(last);
      last = v;
    }
  });

  test('throws outside [MIN_TICK, MAX_TICK]', () => {
    expect(() => getSqrtRatioAtTick(MIN_TICK - 1)).toThrow(/out of bounds/);
    expect(() => getSqrtRatioAtTick(MAX_TICK + 1)).toThrow(/out of bounds/);
  });

  test('throws on non-integer tick', () => {
    expect(() => getSqrtRatioAtTick(1.5 as unknown as number)).toThrow(/non-integer/);
  });
});

describe('getTickAtSqrtRatio — round-trip and monotonicity', () => {
  test('throws below MIN_SQRT_PRICE', () => {
    expect(() => getTickAtSqrtRatio(MIN_SQRT_PRICE - 1n)).toThrow(/out of bounds/);
  });

  test('throws at or above MAX_SQRT_PRICE', () => {
    expect(() => getTickAtSqrtRatio(MAX_SQRT_PRICE)).toThrow(/out of bounds/);
  });

  test.each([
    -887_270, -100_000, -10_000, -1_000, -100, -1, 0, 1, 100, 1_000, 10_000, 100_000,
    887_270,
  ])('round-trip preserves tick %d', (t) => {
    const sqrt = getSqrtRatioAtTick(t);
    expect(getTickAtSqrtRatio(sqrt)).toBe(t);
  });

  test('returned tick monotone in input sqrtPrice', () => {
    const sqrts = [
      MIN_SQRT_PRICE,
      MIN_SQRT_PRICE * 2n,
      getSqrtRatioAtTick(-1_000),
      getSqrtRatioAtTick(0),
      getSqrtRatioAtTick(1_000),
      MAX_SQRT_PRICE - 1n,
    ];
    let last = -Infinity;
    for (const s of sqrts) {
      const t = getTickAtSqrtRatio(s);
      expect(t).toBeGreaterThanOrEqual(last);
      last = t;
    }
  });

  test('floor property: getSqrtRatioAtTick(getTickAtSqrtRatio(x)) <= x', () => {
    const samples = [
      MIN_SQRT_PRICE + 7n,
      getSqrtRatioAtTick(-12_345),
      getSqrtRatioAtTick(0) + 1n,
      getSqrtRatioAtTick(54_321),
      MAX_SQRT_PRICE - 7n,
    ];
    for (const s of samples) {
      const t = getTickAtSqrtRatio(s);
      const back = getSqrtRatioAtTick(t);
      expect(back).toBeLessThanOrEqual(s);
    }
  });
});
