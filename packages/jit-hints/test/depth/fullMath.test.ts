import { describe, expect, test } from 'vitest';

import { mulDiv, mulDivRoundingUp, mulMod256 } from '../../src/depth/fullMath';

describe('mulDiv', () => {
  test('matches integer division on simple inputs', () => {
    expect(mulDiv(5n, 6n, 3n)).toBe(10n);
    expect(mulDiv(7n, 11n, 2n)).toBe(38n);
  });

  test('floors the result toward zero', () => {
    expect(mulDiv(7n, 1n, 3n)).toBe(2n);
    expect(mulDiv(2n, 3n, 5n)).toBe(1n);
  });

  test('handles values larger than uint256-half range', () => {
    const a = (1n << 200n) + 7n;
    const b = (1n << 200n) - 3n;
    const d = 1n << 100n;
    // BigInt arithmetic is unbounded — should never overflow.
    const got = mulDiv(a, b, d);
    expect(got).toBe((a * b) / d);
  });

  test('throws on division by zero', () => {
    expect(() => mulDiv(1n, 1n, 0n)).toThrow(/division by zero/);
  });
});

describe('mulDivRoundingUp', () => {
  test('rounds up when there is a remainder', () => {
    expect(mulDivRoundingUp(7n, 1n, 3n)).toBe(3n);
    expect(mulDivRoundingUp(5n, 5n, 4n)).toBe(7n);
  });

  test('returns the same as mulDiv when the result is exact', () => {
    expect(mulDivRoundingUp(6n, 4n, 3n)).toBe(8n);
    expect(mulDivRoundingUp(10n, 10n, 5n)).toBe(20n);
  });

  test('throws on division by zero', () => {
    expect(() => mulDivRoundingUp(1n, 1n, 0n)).toThrow(/division by zero/);
  });
});

describe('mulMod256', () => {
  test('returns the product modulo 2^256', () => {
    const big = (1n << 255n) - 1n;
    const got = mulMod256(big, big);
    expect(got).toBe((big * big) % (1n << 256n));
  });

  test('matches plain multiplication for small values', () => {
    expect(mulMod256(7n, 11n)).toBe(77n);
  });
});
