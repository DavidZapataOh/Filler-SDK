/**
 * Chain registry for `@filler-sdk/sdk`.
 *
 * Every chain we support has a single source of truth here:
 *   - canonical chainId
 *   - human-readable name
 *   - canonical Uniswap v4 contract addresses (PoolManager, Universal Router,
 *     Permit2, Reactor)
 *
 * Solver authors should NEVER hard-code addresses in their code. Instead:
 *
 *   import { getDeployedAddresses } from '@filler-sdk/sdk';
 *   const addrs = getDeployedAddresses('unichain');
 *   addrs.poolManager;
 *
 * When a new chain ships, only this file changes.
 *
 * Reference sources (audit + verifiable):
 *   - PoolManager: matches `packages/jit-hints/src/env.ts` defaults
 *   - Permit2: `0x000000000022d473030f116ddee9f6b43ac78ba3` (canonical, all chains)
 *   - Universal Router: per-chain — TBD when SDK Plan 02 lands the actual
 *     Uniswap deploy addresses; for now the Reactor + Filler contract
 *     addresses are placeholders (`0x0000…dEaD`) and operators MUST override
 *     via the SDK's optional `addresses` config.
 */

import type { Address, Chain } from 'viem';
import {
  arbitrum as viemArbitrum,
  base as viemBase,
  mainnet as viemMainnet,
  optimism as viemOptimism,
  sepolia as viemSepolia,
} from 'viem/chains';

/** Supported chain identifiers. Branded so callers can't pass arbitrary numbers. */
export type ChainId = 1 | 130 | 8453 | 42161 | 10 | 11_155_111 | 11_155_420;

export type ChainName =
  | 'mainnet'
  | 'unichain'
  | 'base'
  | 'arbitrum'
  | 'optimism'
  | 'sepolia'
  | 'unichainSepolia';

export interface ChainDeployedAddresses {
  /** Uniswap v4 PoolManager. */
  poolManager: Address;
  /** Permit2 — same address on every chain. */
  permit2: Address;
  /**
   * UniswapX Reactor (V2 dutch order). When the SDK adds support for V3 or
   * exclusive-dutch-with-priority orders we'll add a separate field.
   */
  reactor: Address;
  /**
   * Filler contract (this SDK's executor — see contracts/src/Filler.sol).
   * Empty until Sprint 01 deploy script lands real addresses; operators
   * MUST override per-environment.
   */
  filler: Address;
  /**
   * FillerBond contract (slashable bond — see contracts/src/FillerBond.sol).
   * Same caveat as `filler`.
   */
  fillerBond: Address;
}

export interface ChainConfig {
  id: ChainId;
  name: ChainName;
  /** Human-readable label — used in logs / error messages, NEVER for routing. */
  displayName: string;
  /** Default block time in seconds — used by the indexer-lag heuristic. */
  blockTimeSec: number;
  addresses: ChainDeployedAddresses;
}

const PERMIT2: Address = '0x000000000022d473030f116ddee9f6b43ac78ba3';

// Placeholder for not-yet-deployed contracts. Operators MUST override these
// via `getDeployedAddresses`'s second arg until Sprint 01 ships canonical
// deploys to each chain.
const PLACEHOLDER: Address = '0x000000000000000000000000000000000000dEaD';

const MAINNET: ChainConfig = {
  id: 1,
  name: 'mainnet',
  displayName: 'Ethereum Mainnet',
  blockTimeSec: 12,
  addresses: {
    poolManager: '0x000000000004444c5dc75cb358380d2e3de08a90',
    permit2: PERMIT2,
    reactor: PLACEHOLDER,
    filler: PLACEHOLDER,
    fillerBond: PLACEHOLDER,
  },
};

const UNICHAIN: ChainConfig = {
  id: 130,
  name: 'unichain',
  displayName: 'Unichain',
  blockTimeSec: 1,
  addresses: {
    poolManager: '0x1f98400000000000000000000000000000000004',
    permit2: PERMIT2,
    reactor: PLACEHOLDER,
    filler: PLACEHOLDER,
    fillerBond: PLACEHOLDER,
  },
};

const BASE: ChainConfig = {
  id: 8453,
  name: 'base',
  displayName: 'Base',
  blockTimeSec: 2,
  addresses: {
    poolManager: '0x498581ff718922c3f8e6a244956af099b2652b2b',
    permit2: PERMIT2,
    reactor: PLACEHOLDER,
    filler: PLACEHOLDER,
    fillerBond: PLACEHOLDER,
  },
};

const ARBITRUM: ChainConfig = {
  id: 42161,
  name: 'arbitrum',
  displayName: 'Arbitrum One',
  blockTimeSec: 0.25,
  addresses: {
    poolManager: '0x360e68faccca8ca4f01a01ea7b8538def68d2bd1',
    permit2: PERMIT2,
    reactor: PLACEHOLDER,
    filler: PLACEHOLDER,
    fillerBond: PLACEHOLDER,
  },
};

const OPTIMISM: ChainConfig = {
  id: 10,
  name: 'optimism',
  displayName: 'OP Mainnet',
  blockTimeSec: 2,
  addresses: {
    poolManager: '0x9a13f98cb987694c9f086b1f5eb990eea8264ec3',
    permit2: PERMIT2,
    reactor: PLACEHOLDER,
    filler: PLACEHOLDER,
    fillerBond: PLACEHOLDER,
  },
};

// Testnet entries — addresses are placeholders until Sprint 01 deploy lands
// (see `contracts/script/DeploySepolia.s.sol` + `DeployUnichainSepolia.s.sol`).
// Operators MUST override via `getDeployedAddresses(chain, overrides)` until
// the canonical deploy script is run.
const SEPOLIA: ChainConfig = {
  id: 11_155_111,
  name: 'sepolia',
  displayName: 'Sepolia',
  blockTimeSec: 12,
  addresses: {
    poolManager: PLACEHOLDER,
    permit2: PERMIT2,
    reactor: PLACEHOLDER,
    filler: PLACEHOLDER,
    fillerBond: PLACEHOLDER,
  },
};

const UNICHAIN_SEPOLIA: ChainConfig = {
  id: 11_155_420,
  name: 'unichainSepolia',
  displayName: 'Unichain Sepolia',
  blockTimeSec: 1,
  addresses: {
    poolManager: PLACEHOLDER,
    permit2: PERMIT2,
    reactor: PLACEHOLDER,
    filler: PLACEHOLDER,
    fillerBond: PLACEHOLDER,
  },
};

/**
 * The exhaustive chain registry. Iterated by `getChainById` / `getChainByName`.
 * Frozen so consumers can't accidentally mutate the deployed addresses table
 * (e.g. via a misconfigured patch in a downstream library).
 */
export const chains = Object.freeze({
  mainnet: MAINNET,
  unichain: UNICHAIN,
  base: BASE,
  arbitrum: ARBITRUM,
  optimism: OPTIMISM,
  sepolia: SEPOLIA,
  unichainSepolia: UNICHAIN_SEPOLIA,
}) satisfies Readonly<Record<ChainName, ChainConfig>>;

const BY_ID: Readonly<Record<ChainId, ChainConfig>> = Object.freeze({
  1: MAINNET,
  130: UNICHAIN,
  8453: BASE,
  42161: ARBITRUM,
  10: OPTIMISM,
  11_155_111: SEPOLIA,
  11_155_420: UNICHAIN_SEPOLIA,
});

export function getChainById(id: ChainId): ChainConfig {
  return BY_ID[id];
}

export function getChainByName(name: ChainName): ChainConfig {
  return chains[name];
}

/**
 * Resolve deployed addresses for a chain, with optional per-call overrides.
 * Overrides are merged on top of the canonical map — useful for testnets,
 * staging deployments, and the bond/filler contracts (which are not yet
 * deployed on mainnets at the time of this SDK's v0).
 */
export function getDeployedAddresses(
  chain: ChainName | ChainId,
  overrides: Partial<ChainDeployedAddresses> = {},
): ChainDeployedAddresses {
  const config =
    typeof chain === 'number' ? getChainById(chain) : getChainByName(chain);
  return { ...config.addresses, ...overrides };
}

/** Type guard — narrows arbitrary numbers down to a supported `ChainId`. */
export function isSupportedChainId(id: number): id is ChainId {
  return id in BY_ID;
}

// === viem Chain interop ===================================================

// Custom Unichain definitions (viem upstream may not include them yet).
const UNICHAIN_VIEM: Chain = {
  id: 130,
  name: 'Unichain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://mainnet.unichain.org'] },
  },
  blockExplorers: {
    default: { name: 'Uniscan', url: 'https://uniscan.xyz' },
  },
};

const UNICHAIN_SEPOLIA_VIEM: Chain = {
  id: 11_155_420,
  name: 'Unichain Sepolia',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://sepolia.unichain.org'] },
  },
  testnet: true,
};

const VIEM_BY_ID: Readonly<Record<ChainId, Chain>> = Object.freeze({
  1: viemMainnet,
  130: UNICHAIN_VIEM,
  8453: viemBase,
  42161: viemArbitrum,
  10: viemOptimism,
  11_155_111: viemSepolia,
  11_155_420: UNICHAIN_SEPOLIA_VIEM,
});

/**
 * Resolve a viem `Chain` object for the given chain id. Solver authors call
 * this when constructing their own `PublicClient` / `WalletClient` (BYO viem
 * setup) — the SDK's `createFillerFromPrivateKey` shortcut does it
 * automatically.
 */
export function getViemChain(id: ChainId): Chain {
  const chain = VIEM_BY_ID[id];
  if (chain === undefined) {
    throw new Error(`Unsupported chain ID: ${id}`);
  }
  return chain;
}
