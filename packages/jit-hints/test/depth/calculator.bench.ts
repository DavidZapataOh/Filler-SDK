import { bench, describe } from 'vitest';

import {
  type DepthPool,
  calculateDepthHint,
} from '../../src/depth/calculator';
import { getSqrtRatioAtTick } from '../../src/depth/tickMath';

/** Plan 03 acceptance criterion: P99 < 50ms per query. */
const POOL_ID = '0xaabbccddeeff00112233445566778899aabbccddeeff00112233445566778899' as const;

const pool: DepthPool = {
  id: POOL_ID,
  sqrtPriceX96: getSqrtRatioAtTick(0),
  liquidity: 1_000_000_000_000_000_000_000n,
  tick: 0,
  tickSpacing: 60,
  fee: 3000,
};

describe('calculateDepthHint perf', () => {
  bench('zeroForOne, mid-size trade', () => {
    calculateDepthHint(pool, [], {
      poolId: POOL_ID,
      tradeSize: 1_000_000_000_000_000_000n,
      zeroForOne: true,
      slippageBps: 50,
    });
  });

  bench('oneForZero, large trade', () => {
    calculateDepthHint(pool, [], {
      poolId: POOL_ID,
      tradeSize: 100_000_000_000_000_000_000n,
      zeroForOne: false,
      slippageBps: 50,
    });
  });

  bench('zeroForOne, dust trade', () => {
    calculateDepthHint(pool, [], {
      poolId: POOL_ID,
      tradeSize: 1_000n,
      zeroForOne: true,
      slippageBps: 50,
    });
  });
});
