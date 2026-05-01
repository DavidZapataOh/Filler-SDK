import { describe, expect, test } from 'vitest';

import {
  type DepthPool,
  calculateDepthHint,
} from '../../src/depth/calculator';
import { getSqrtRatioAtTick } from '../../src/depth/tickMath';

const POOL_ID: `0x${string}` = '0xaabbccddeeff00112233445566778899aabbccddeeff00112233445566778899';

/** A reasonably realistic ETH/USDC-style pool: tick 0, price ≈ 1, tickSpacing 60. */
function basePool(overrides: Partial<DepthPool> = {}): DepthPool {
  return {
    id: POOL_ID,
    sqrtPriceX96: getSqrtRatioAtTick(0),
    liquidity: 1_000_000_000_000_000_000_000n, // 1e21 — deep pool
    tick: 0,
    tickSpacing: 60,
    fee: 3000, // 0.30%
    ...overrides,
  };
}

describe('calculateDepthHint — input validation', () => {
  test('rejects zero tradeSize', () => {
    expect(() =>
      calculateDepthHint(basePool(), [], {
        poolId: POOL_ID,
        tradeSize: 0n,
        zeroForOne: true,
        slippageBps: 50,
      }),
    ).toThrow(/tradeSize/);
  });

  test('rejects negative tradeSize', () => {
    expect(() =>
      calculateDepthHint(basePool(), [], {
        poolId: POOL_ID,
        tradeSize: -1n,
        zeroForOne: true,
        slippageBps: 50,
      }),
    ).toThrow(/tradeSize/);
  });

  test('rejects pool with zero liquidity', () => {
    expect(() =>
      calculateDepthHint(basePool({ liquidity: 0n }), [], {
        poolId: POOL_ID,
        tradeSize: 1_000n,
        zeroForOne: true,
        slippageBps: 50,
      }),
    ).toThrow(/liquidity/);
  });

  test('rejects non-positive tickSpacing', () => {
    expect(() =>
      calculateDepthHint(basePool({ tickSpacing: 0 }), [], {
        poolId: POOL_ID,
        tradeSize: 1_000n,
        zeroForOne: true,
        slippageBps: 50,
      }),
    ).toThrow(/tickSpacing/);
  });
});

describe('calculateDepthHint — happy path: zeroForOne (sell token0)', () => {
  test('returns range that brackets the pool tick + reflects price decreasing', () => {
    const pool = basePool();
    const hint = calculateDepthHint(pool, [], {
      poolId: POOL_ID,
      tradeSize: 1_000_000_000_000_000n, // 0.001 of pool liquidity
      zeroForOne: true,
      slippageBps: 50,
    });

    // The trade pushes price DOWN, so target tick is below pool.tick.
    // Range should cover [target, current] (with safety margin).
    expect(hint.recommendedTickLower).toBeLessThan(pool.tick);
    expect(hint.recommendedTickUpper).toBeGreaterThanOrEqual(pool.tick);
    expect(hint.recommendedLiquidityDelta).toBeGreaterThan(0n);
  });

  test('snaps recommended ticks to spacing', () => {
    const pool = basePool({ tickSpacing: 60 });
    const hint = calculateDepthHint(pool, [], {
      poolId: POOL_ID,
      tradeSize: 1_000_000_000n,
      zeroForOne: true,
      slippageBps: 50,
    });
    // Use Number.isInteger(x / spacing) instead of `x % 60 === 0` because
    // JavaScript's `(-60 % 60) === -0` and Vitest's toBe(0) uses Object.is.
    expect(Number.isInteger(hint.recommendedTickLower / 60)).toBe(true);
    expect(Number.isInteger(hint.recommendedTickUpper / 60)).toBe(true);
  });

  test('expectedFeeCapture matches LP fee on input', () => {
    const pool = basePool({ fee: 3000 });
    const tradeSize = 1_000_000n;
    const hint = calculateDepthHint(pool, [], {
      poolId: POOL_ID,
      tradeSize,
      zeroForOne: true,
      slippageBps: 50,
    });
    // 0.30% of input = 3,000.
    expect(hint.expectedFeeCapture).toBe(3_000n);
  });

  test('different fee tiers produce proportional fee capture', () => {
    const tradeSize = 1_000_000n;
    const fee500 = calculateDepthHint(basePool({ fee: 500 }), [], {
      poolId: POOL_ID,
      tradeSize,
      zeroForOne: true,
      slippageBps: 50,
    });
    const fee10000 = calculateDepthHint(basePool({ fee: 10_000 }), [], {
      poolId: POOL_ID,
      tradeSize,
      zeroForOne: true,
      slippageBps: 50,
    });
    expect(fee500.expectedFeeCapture).toBe(500n);
    expect(fee10000.expectedFeeCapture).toBe(10_000n);
  });

  test('larger trades produce larger slippage', () => {
    const small = calculateDepthHint(basePool(), [], {
      poolId: POOL_ID,
      tradeSize: 1_000n,
      zeroForOne: true,
      slippageBps: 50,
    });
    const big = calculateDepthHint(basePool(), [], {
      poolId: POOL_ID,
      tradeSize: 1_000_000_000_000_000_000n, // 0.001 of pool
      zeroForOne: true,
      slippageBps: 50,
    });
    expect(big.expectedSlippageBps).toBeGreaterThanOrEqual(small.expectedSlippageBps);
  });
});

describe('calculateDepthHint — happy path: oneForZero (buy token0)', () => {
  test('returns range that brackets the pool tick + reflects price increasing', () => {
    const pool = basePool();
    const hint = calculateDepthHint(pool, [], {
      poolId: POOL_ID,
      tradeSize: 1_000_000_000_000_000n,
      zeroForOne: false,
      slippageBps: 50,
    });

    expect(hint.recommendedTickLower).toBeLessThanOrEqual(pool.tick);
    expect(hint.recommendedTickUpper).toBeGreaterThan(pool.tick);
    expect(hint.recommendedLiquidityDelta).toBeGreaterThan(0n);
  });
});

describe('calculateDepthHint — net profit', () => {
  test('zero net profit when gas cost exceeds fee capture', () => {
    const pool = basePool({ fee: 100 }); // 0.01%
    const hint = calculateDepthHint(pool, [], {
      poolId: POOL_ID,
      tradeSize: 1_000n, // dust → fee capture = 1 wei × tiny
      zeroForOne: true,
      slippageBps: 50,
      gasPriceWei: 100_000_000_000n, // 100 gwei
      gasOverhead: 600_000n,
    });
    expect(hint.estimatedNetProfit).toBe(0n);
  });

  test('positive net profit on a meaningful trade with low gas', () => {
    const pool = basePool({ fee: 3000 });
    const hint = calculateDepthHint(pool, [], {
      poolId: POOL_ID,
      tradeSize: 10_000_000_000_000_000_000n, // 10 ether worth
      zeroForOne: true,
      slippageBps: 50,
      gasPriceWei: 1_000_000_000n, // 1 gwei
      gasOverhead: 600_000n,
    });
    expect(hint.estimatedNetProfit).toBeGreaterThan(0n);
    // Fee = 0.3% of 10 ether = 0.03 ether = 3e16. Gas = 6e5 × 1e9 = 6e14.
    expect(hint.expectedFeeCapture).toBe((10_000_000_000_000_000_000n * 3000n) / 1_000_000n);
    expect(hint.estimatedNetProfit).toBe(hint.expectedFeeCapture - 600_000_000_000_000n);
  });

  test('honors caller-provided gas overhead', () => {
    const pool = basePool({ fee: 3000 });
    const hint = calculateDepthHint(pool, [], {
      poolId: POOL_ID,
      tradeSize: 1_000_000_000_000_000_000n,
      zeroForOne: true,
      slippageBps: 50,
      gasOverhead: 1_500_000n,
    });
    expect(hint.expectedGasOverhead).toBe(1_500_000n);
  });
});

describe('calculateDepthHint — diagnostics + edge cases', () => {
  test('returns the pool snapshot used for the calculation', () => {
    const pool = basePool({ tick: 12_345 });
    pool.sqrtPriceX96 = getSqrtRatioAtTick(12_345);
    const hint = calculateDepthHint(pool, [], {
      poolId: POOL_ID,
      tradeSize: 1_000_000n,
      zeroForOne: true,
      slippageBps: 50,
    });
    expect(hint.poolCurrentTick).toBe(12_345);
    expect(hint.poolCurrentSqrtPrice).toBe(pool.sqrtPriceX96);
  });

  test('handles pools with non-zero starting tick', () => {
    const pool = basePool({ tick: 60_000 });
    pool.sqrtPriceX96 = getSqrtRatioAtTick(60_000);
    expect(() =>
      calculateDepthHint(pool, [], {
        poolId: POOL_ID,
        tradeSize: 1_000_000_000_000n,
        zeroForOne: true,
        slippageBps: 50,
      }),
    ).not.toThrow();
  });

  test('does not crash on a wide range of fuzzed-but-bounded trades', () => {
    const pool = basePool();
    for (let i = 0; i < 64; i++) {
      const tradeSize = BigInt(1_000 + i * 1_000_000);
      const zeroForOne = i % 2 === 0;
      expect(() =>
        calculateDepthHint(pool, [], {
          poolId: POOL_ID,
          tradeSize,
          zeroForOne,
          slippageBps: 50,
        }),
      ).not.toThrow();
    }
  });
});
