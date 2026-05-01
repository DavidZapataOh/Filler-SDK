import { createConfig } from 'ponder';

import { v4PoolManagerAbi } from './abis/v4PoolManager';
import { loadEnv } from './src/env';

const env = loadEnv();

/**
 * Spread `ws` only when defined. With `exactOptionalPropertyTypes: true`, passing
 * `ws: undefined` to a field typed `ws?: string` is a type error.
 */
function chain(args: {
  id: number;
  rpc: string;
  ws: string | undefined;
  pollingInterval: number;
}): {
  id: number;
  rpc: string;
  pollingInterval: number;
  ws?: string;
} {
  return args.ws === undefined
    ? { id: args.id, rpc: args.rpc, pollingInterval: args.pollingInterval }
    : {
        id: args.id,
        rpc: args.rpc,
        pollingInterval: args.pollingInterval,
        ws: args.ws,
      };
}

/**
 * Multi-chain Ponder configuration. The chains list is intentionally Unichain-first
 * (priority for the hackathon track), with mainnet + L2 expansion behind it. New
 * chains can be added here without touching event handlers — the indexer is
 * chain-agnostic by construction.
 *
 * Each chain's RPC config:
 *   - `rpc`: HTTP RPC URL (used for backfill).
 *   - `ws`:  optional WebSocket URL (used for live tracking).
 *   - `pollingInterval`: per-chain block-time tuning. Unichain is sub-second; mainnet
 *      is ~12s; L2s 1-2s.
 *
 * `maxRequestsPerSecond` is deprecated in Ponder 0.16+ — Ponder handles RPC rate
 * limits automatically.
 */
export default createConfig({
  database: env.DATABASE_URL
    ? { kind: 'postgres', connectionString: env.DATABASE_URL }
    : { kind: 'pglite', directory: '.ponder/pglite' },

  chains: {
    unichain: chain({
      id: 130,
      rpc: env.UNICHAIN_RPC_URL,
      ws: env.UNICHAIN_WSS_URL,
      pollingInterval: 1_000,
    }),
    mainnet: chain({
      id: 1,
      rpc: env.MAINNET_RPC_URL,
      ws: env.MAINNET_WSS_URL,
      pollingInterval: 4_000,
    }),
    base: chain({
      id: 8453,
      rpc: env.BASE_RPC_URL,
      ws: env.BASE_WSS_URL,
      pollingInterval: 1_000,
    }),
    arbitrum: chain({
      id: 42_161,
      rpc: env.ARBITRUM_RPC_URL,
      ws: env.ARBITRUM_WSS_URL,
      pollingInterval: 250,
    }),
    optimism: chain({
      id: 10,
      rpc: env.OPTIMISM_RPC_URL,
      ws: env.OPTIMISM_WSS_URL,
      pollingInterval: 2_000,
    }),
  },

  contracts: {
    PoolManager: {
      abi: v4PoolManagerAbi,
      chain: {
        unichain: {
          address: env.UNICHAIN_POOL_MANAGER,
          startBlock: env.UNICHAIN_START_BLOCK,
        },
        mainnet: {
          address: env.MAINNET_POOL_MANAGER,
          startBlock: env.MAINNET_START_BLOCK,
        },
        base: {
          address: env.BASE_POOL_MANAGER,
          startBlock: env.BASE_START_BLOCK,
        },
        arbitrum: {
          address: env.ARBITRUM_POOL_MANAGER,
          startBlock: env.ARBITRUM_START_BLOCK,
        },
        optimism: {
          address: env.OPTIMISM_POOL_MANAGER,
          startBlock: env.OPTIMISM_START_BLOCK,
        },
      },
    },
  },
});
