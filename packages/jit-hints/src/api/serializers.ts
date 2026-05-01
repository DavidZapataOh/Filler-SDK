import type { DepthHint } from '../depth/calculator';
import type { ChainStatus, PoolRow } from './db';

/**
 * BigInt → string converters so JSON.stringify doesn't reject. We never coerce
 * to Number (loses precision for amounts beyond 2^53) — every monetary value
 * is rendered as a decimal string.
 */

export interface SerializedDepthHint {
  pool: string;
  hint: {
    tickLower: number;
    tickUpper: number;
    liquidityDelta: string;
    expectedFeeCapture: string;
    expectedSlippageBps: number;
    expectedGasOverhead: string;
    estimatedNetProfit: string;
  };
  poolState: {
    currentTick: number;
    currentSqrtPrice: string;
  };
}

export function serializeDepthHint(poolId: string, hint: DepthHint): SerializedDepthHint {
  return {
    pool: poolId,
    hint: {
      tickLower: hint.recommendedTickLower,
      tickUpper: hint.recommendedTickUpper,
      liquidityDelta: hint.recommendedLiquidityDelta.toString(),
      expectedFeeCapture: hint.expectedFeeCapture.toString(),
      expectedSlippageBps: hint.expectedSlippageBps,
      expectedGasOverhead: hint.expectedGasOverhead.toString(),
      estimatedNetProfit: hint.estimatedNetProfit.toString(),
    },
    poolState: {
      currentTick: hint.poolCurrentTick,
      currentSqrtPrice: hint.poolCurrentSqrtPrice.toString(),
    },
  };
}

export interface SerializedPool {
  id: string;
  chainId: number;
  currency0: string;
  currency1: string;
  fee: number;
  tickSpacing: number;
  hooks: string;
  sqrtPriceX96: string;
  liquidity: string;
  tick: number;
  initializedAt: string;
  updatedAt: string;
}

export function serializePool(p: PoolRow): SerializedPool {
  return {
    id: p.id,
    chainId: p.chainId,
    currency0: p.currency0,
    currency1: p.currency1,
    fee: p.fee,
    tickSpacing: p.tickSpacing,
    hooks: p.hooks,
    sqrtPriceX96: p.sqrtPriceX96.toString(),
    liquidity: p.liquidity.toString(),
    tick: p.tick,
    initializedAt: p.initializedAt.toString(),
    updatedAt: p.updatedAt.toString(),
  };
}

export interface SerializedChainStatus {
  chainId: number;
  latestBlock: string | null;
  lastUpdatedAt: string | null;
}

export function serializeChainStatus(s: ChainStatus): SerializedChainStatus {
  return {
    chainId: s.chainId,
    latestBlock: s.latestBlock === null ? null : s.latestBlock.toString(),
    lastUpdatedAt: s.lastUpdatedAt === null ? null : s.lastUpdatedAt.toString(),
  };
}
