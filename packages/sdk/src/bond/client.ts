/**
 * `BondClient` — wraps the `FillerBond` contract on a single chain. Provides
 * the stake / unstake / withdraw lifecycle the bond contract requires.
 *
 * **Implementation status (Plan 02):** class shape + constructor + read-only
 * accessors are real. On-chain reads (`totalStake`, `activeStake`,
 * `pendingUnstake`, `slashedTotal`) and writes (`requestUnstake`, `withdraw`)
 * land in **Plan 07** alongside the FillerBond fork tests.
 *
 * Until Plan 07 each method rejects with `FillerError(UNKNOWN)` carrying a
 * Plan 07 pointer (loud-failure posture).
 */

import type { Address, Hash } from 'viem';

import type { ChainId } from '../chains';
import { FillerError } from '../errors';
import type { BondClientHandle, FillerLogger } from '../types';

export interface BondClientConfig {
  chainId: ChainId;
  /** Address of the deployed `FillerBond` contract. */
  bondContract: Address;
  /** Solver account that owns the stake. */
  account: Address;
  /** viem `PublicClient` — used for reads. Typed `unknown` here, narrowed at use. */
  publicClient: unknown;
  /** viem `WalletClient` — used for writes. */
  walletClient: unknown;
  logger: FillerLogger;
}

export class BondClient implements BondClientHandle {
  readonly #publicClient: unknown;
  readonly #walletClient: unknown;
  readonly #logger: FillerLogger;
  readonly chainId: ChainId;
  readonly bondContract: Address;
  readonly account: Address;

  constructor(cfg: BondClientConfig) {
    this.chainId = cfg.chainId;
    this.bondContract = cfg.bondContract;
    this.account = cfg.account;
    this.#publicClient = cfg.publicClient;
    this.#walletClient = cfg.walletClient;
    this.#logger = cfg.logger.child?.({ component: 'BondClient' }) ?? cfg.logger;
  }

  totalStake(): Promise<bigint> {
    return this.#unimplemented('totalStake');
  }

  activeStake(): Promise<bigint> {
    return this.#unimplemented('activeStake');
  }

  pendingUnstake(): Promise<bigint> {
    return this.#unimplemented('pendingUnstake');
  }

  slashedTotal(): Promise<bigint> {
    return this.#unimplemented('slashedTotal');
  }

  requestUnstake(_amount: bigint): Promise<Hash> {
    return this.#unimplemented('requestUnstake');
  }

  withdraw(): Promise<Hash> {
    return this.#unimplemented('withdraw');
  }

  #unimplemented<T>(method: string): Promise<T> {
    return Promise.reject(
      new FillerError(
        'UNKNOWN',
        `BondClient.${method} is implemented in Plan 07 (FillerBond on-chain integration)`,
        { context: { bondContract: this.bondContract, account: this.account } },
      ),
    );
  }
}
