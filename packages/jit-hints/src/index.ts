/**
 * @filler-sdk/jit-hints
 *
 * JIT inventory hints indexer for Uniswap v4.
 *
 * The novel primitive that defines the SDK category: given (pool, trade size,
 * direction), compute the optimal tick range + expected fee capture for a
 * just-in-time liquidity fill on UniswapX.
 *
 * The Ponder runtime entry points (`ponder dev`, `ponder start`) consume
 * `ponder.config.ts` + `ponder.schema.ts` at the package root; this barrel only
 * re-exports public types for downstream consumers (SDK, dashboard).
 *
 * @see plans/sprint-02-indexer/README.md
 */

export { v4PoolManagerAbi } from '../abis/v4PoolManager';
export type { Env } from './env';
export { _resetEnvForTesting, loadEnv } from './env';

export const JIT_HINTS_VERSION = '0.0.0' as const;
