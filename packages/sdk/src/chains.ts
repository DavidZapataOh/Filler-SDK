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

import type { Address } from 'viem';

/** Supported chain identifiers. Branded so callers can't pass arbitrary numbers. */
export type ChainId = 1 | 130 | 8453 | 42161 | 10;

export type ChainName = 'mainnet' | 'unichain' | 'base' | 'arbitrum' | 'optimism';

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
}) satisfies Readonly<Record<ChainName, ChainConfig>>;

const BY_ID: Readonly<Record<ChainId, ChainConfig>> = Object.freeze({
  1: MAINNET,
  130: UNICHAIN,
  8453: BASE,
  42161: ARBITRUM,
  10: OPTIMISM,
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
