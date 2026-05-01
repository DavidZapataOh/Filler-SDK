import { type MockDbState, createMockDb } from '../../src/api/db';
import type { JitHintsDb, PoolRow } from '../../src/api/db';
import type { DepthTick } from '../../src/depth/calculator';
import { getSqrtRatioAtTick } from '../../src/depth/tickMath';

export const POOL_A: `0x${string}` =
  '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
export const POOL_B: `0x${string}` =
  '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

export const TOKEN_USDC: `0x${string}` = '0x1111111111111111111111111111111111111111';
export const TOKEN_WETH: `0x${string}` = '0x2222222222222222222222222222222222222222';
export const TOKEN_WBTC: `0x${string}` = '0x3333333333333333333333333333333333333333';

export function makePool(overrides: Partial<PoolRow> = {}): PoolRow {
  return {
    id: POOL_A,
    chainId: 1,
    currency0: TOKEN_USDC,
    currency1: TOKEN_WETH,
    fee: 3000,
    tickSpacing: 60,
    hooks: '0x0000000000000000000000000000000000000000',
    sqrtPriceX96: getSqrtRatioAtTick(0),
    liquidity: 1_000_000_000_000_000_000_000n,
    tick: 0,
    initializedAt: 1n,
    updatedAt: 1n,
    ...overrides,
  };
}

export function buildMockDb(extra?: Partial<MockDbState>): JitHintsDb {
  const pools = extra?.pools ?? [
    makePool(),
    makePool({ id: POOL_B, chainId: 130, currency0: TOKEN_WETH, currency1: TOKEN_WBTC }),
  ];
  const ticks = extra?.ticks ?? [];
  const chainStatus = extra?.chainStatus ?? [
    { chainId: 1, latestBlock: 21_000_000n, lastUpdatedAt: 1_700_000_000n },
    { chainId: 130, latestBlock: 4_500n, lastUpdatedAt: 1_700_000_001n },
  ];
  return createMockDb({ pools, ticks, chainStatus });
}

export const DEFAULT_TICKS: DepthTick[] = [];
