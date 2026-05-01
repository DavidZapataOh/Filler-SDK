/**
 * BondClient surface — full implementation in Plan 07.
 *
 * Today: a typed shape so `import { type BondClient } from '@filler-sdk/sdk/bond'`
 * resolves and tsup bundles a (currently empty) entry. The actual class
 * (stake / requestUnstake / withdraw / on-chain status reads) lands in
 * Plan 07 alongside the contract integration tests.
 */

import type { Address, Hash } from 'viem';

import type { ChainId } from '../chains';

/**
 * Parameters for creating a `BondClient`. The full options bag is finalised in
 * Plan 07 — for now we capture the chain + bond contract address so callers
 * can author the import shape today.
 */
export interface BondClientConfig {
  chainId: ChainId;
  /** Address of the deployed `FillerBond` contract on this chain. */
  bondContract: Address;
  /** Solver account that owns the stake. */
  account: Address;
}

/**
 * Minimum public surface every implementation must expose. Concrete impl + a
 * mock for tests both land in Plan 07.
 */
export interface BondClient {
  readonly chainId: ChainId;
  readonly bondContract: Address;
  readonly account: Address;
  /** Total stake (active + pending unstake), in the bond token. */
  totalStake(): Promise<bigint>;
  /** Stake the SDK can use as collateral right now. */
  activeStake(): Promise<bigint>;
  /** Stake currently in the unstake-cooldown window. */
  pendingUnstake(): Promise<bigint>;
  /** Stake that has slashed since the bond opened. */
  slashedTotal(): Promise<bigint>;
  /** Begin the unstake cooldown for `amount`. Returns the tx hash. */
  requestUnstake(amount: bigint): Promise<Hash>;
  /** After cooldown, withdraw the requested amount. */
  withdraw(): Promise<Hash>;
}

/**
 * @internal
 */
export const __BOND_PLACEHOLDER = Symbol.for('@filler-sdk/sdk:bond:v0');
