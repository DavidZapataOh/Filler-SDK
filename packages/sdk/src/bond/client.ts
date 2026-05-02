/**
 * `BondClient` — typed wrapper around `FillerBond.sol` for a single
 * `(fillerContract, account)` pair.
 *
 * Lifecycle:
 *   1. `stake(amount)`     — pay ETH into the bond pool for `fillerContract`.
 *   2. `requestUnstake(n)` — start the 7-day cooldown for `n` wei. The
 *      contract reduces `activeStake` immediately so a slash during cooldown
 *      can't consume already-requested funds.
 *   3. `withdraw()`        — after cooldown, transfer ETH back to `account`.
 *
 * Reads:
 *   - `totalStake()`       — `activeStake() + pendingUnstake()`.
 *   - `activeStake()`      — usable collateral right now.
 *   - `pendingUnstake()`   — currently in cooldown.
 *   - `slashedTotal()`     — global slashed amount on this bond contract.
 *   - `cooldownEndsAt()`   — UNIX timestamp when withdraw becomes callable
 *                            (or `null` if no pending unstake).
 *
 * Convenience:
 *   - `waitAndWithdraw()`  — block until cooldown elapsed, then withdraw.
 *
 * Loud-failure posture (matching the rest of the SDK):
 *   - `stake(0n)`            → `ConfigInvalidError`.
 *   - `requestUnstake(>active)` → `InsufficientLiquidityError` pre-flight.
 *   - `withdraw()` before cooldown → `IntentExpiredError` (re-using the typed
 *     error class for "you tried before the time was right").
 *   - RPC failures               → `RPCError` with the original `cause`.
 *
 * The on-chain `FillerBond.sol` is the authoritative gate — every preflight
 * is defense-in-depth + fast feedback so callers don't pay gas on a tx that
 * would deterministically revert.
 */

import {
  type Abi,
  type Address,
  type Hash,
  type PublicClient,
  type WalletClient,
} from 'viem';

import { fillerBondAbi } from '../abis';
import type { ChainId } from '../chains';
import {
  ConfigInvalidError,
  IntentExpiredError,
  InsufficientLiquidityError,
  RPCError,
} from '../errors';
import { extractRevertReason } from '../fills/simulation';
import type { BondClientHandle, FillerLogger } from '../types';

const COOLDOWN_BUFFER_SEC = 5n;

export interface BondClientConfig {
  chainId: ChainId;
  /** Address of the deployed `FillerBond.sol` contract. */
  bondContract: Address;
  /** Address of the `Filler.sol` deployment this bond is backing. */
  fillerContract: Address;
  /** Solver account that owns the stake (also `msg.sender` for writes). */
  account: Address;
  /** viem `PublicClient` — used for reads. */
  publicClient: unknown;
  /** viem `WalletClient` — used for writes. */
  walletClient: unknown;
  logger: FillerLogger;
}

export class BondClient implements BondClientHandle {
  readonly #publicClient: PublicClient;
  readonly #walletClient: WalletClient;
  readonly #logger: FillerLogger;
  readonly chainId: ChainId;
  readonly bondContract: Address;
  readonly fillerContract: Address;
  readonly account: Address;

  constructor(cfg: BondClientConfig) {
    this.chainId = cfg.chainId;
    this.bondContract = cfg.bondContract;
    this.fillerContract = cfg.fillerContract;
    this.account = cfg.account;
    this.#publicClient = cfg.publicClient as PublicClient;
    this.#walletClient = cfg.walletClient as WalletClient;
    this.#logger = cfg.logger.child?.({ component: 'BondClient' }) ?? cfg.logger;
  }

  // === Reads ==============================================================

  async totalStake(): Promise<bigint> {
    const [active, pending] = await Promise.all([
      this.activeStake(),
      this.pendingUnstake(),
    ]);
    return active + pending;
  }

  async activeStake(): Promise<bigint> {
    return await this.#read('stakeOf', [this.fillerContract, this.account]);
  }

  async pendingUnstake(): Promise<bigint> {
    const result = await this.#read<readonly [bigint, bigint]>(
      'pendingWithdrawal',
      [this.fillerContract, this.account],
    );
    return result[0];
  }

  async slashedTotal(): Promise<bigint> {
    return await this.#read('totalSlashed', []);
  }

  /**
   * Returns the UNIX timestamp (seconds) at which `withdraw()` becomes
   * callable. `null` when there's no pending unstake.
   *
   * The on-chain `pendingWithdrawal` returns `availableAt = type(uint256).max`
   * when there's no pending request — we map that sentinel to `null`.
   */
  async cooldownEndsAt(): Promise<bigint | null> {
    const [, availableAt] = await this.#read<readonly [bigint, bigint]>(
      'pendingWithdrawal',
      [this.fillerContract, this.account],
    );
    // `type(uint256).max` = 2^256 - 1
    const UINT256_MAX = (1n << 256n) - 1n;
    if (availableAt === UINT256_MAX) return null;
    return availableAt;
  }

  // === Writes =============================================================

  async stake(amount: bigint): Promise<Hash> {
    if (amount <= 0n) {
      throw new ConfigInvalidError(
        `stake amount must be > 0; got ${amount.toString()}`,
        { context: { fillerContract: this.fillerContract } },
      );
    }
    const account = this.#walletClient.account;
    if (account === undefined) {
      throw new ConfigInvalidError(
        'walletClient has no account bound — cannot stake',
      );
    }
    return await this.#write(
      'stake',
      [this.fillerContract],
      { value: amount, account },
    );
  }

  async requestUnstake(amount: bigint): Promise<Hash> {
    if (amount <= 0n) {
      throw new ConfigInvalidError(
        `requestUnstake amount must be > 0; got ${amount.toString()}`,
      );
    }
    const account = this.#walletClient.account;
    if (account === undefined) {
      throw new ConfigInvalidError(
        'walletClient has no account bound — cannot requestUnstake',
      );
    }
    // Pre-flight: don't pay gas if we obviously don't have enough.
    const active = await this.activeStake();
    if (amount > active) {
      throw new InsufficientLiquidityError(
        `requestUnstake amount ${amount.toString()} exceeds activeStake ${active.toString()}`,
        {
          context: {
            fillerContract: this.fillerContract,
            requested: amount.toString(),
            available: active.toString(),
          },
        },
      );
    }
    return await this.#write(
      'requestUnstake',
      [this.fillerContract, amount],
      { account },
    );
  }

  async withdraw(): Promise<Hash> {
    const account = this.#walletClient.account;
    if (account === undefined) {
      throw new ConfigInvalidError(
        'walletClient has no account bound — cannot withdraw',
      );
    }
    // Pre-flight: cooldown must have elapsed. The contract's `withdraw` reverts
    // with `CooldownNotElapsed()` otherwise; we surface the same condition
    // client-side as `IntentExpiredError` (re-using the typed class for "tried
    // before the time was right").
    const endsAt = await this.cooldownEndsAt();
    if (endsAt === null) {
      throw new IntentExpiredError(0n, 0n, {
        context: {
          fillerContract: this.fillerContract,
          reason: 'no pending unstake',
        },
      });
    }
    const now = BigInt(Math.floor(Date.now() / 1000));
    if (now < endsAt) {
      throw new IntentExpiredError(endsAt, now, {
        context: {
          fillerContract: this.fillerContract,
          reason: 'cooldown not elapsed',
          remainingSec: (endsAt - now).toString(),
        },
      });
    }
    return await this.#write('withdraw', [this.fillerContract], { account });
  }

  /**
   * Convenience: block until the cooldown has elapsed (with a small buffer)
   * then call `withdraw()`. Throws if there's no pending unstake to withdraw.
   *
   * **Defensive cap (max wait):** caller can pass `maxWaitMs` to bound how
   * long we'll sleep — useful for CI / tests that don't want to actually
   * wait 7 days. Defaults to `Infinity` (wait as long as the contract says).
   */
  async waitAndWithdraw(opts: { maxWaitMs?: number } = {}): Promise<Hash> {
    const endsAt = await this.cooldownEndsAt();
    if (endsAt === null) {
      throw new IntentExpiredError(0n, 0n, {
        context: {
          fillerContract: this.fillerContract,
          reason: 'no pending unstake to wait for',
        },
      });
    }
    const now = BigInt(Math.floor(Date.now() / 1000));
    if (now < endsAt) {
      const remainingSec = endsAt + COOLDOWN_BUFFER_SEC - now;
      const waitMs = Number(remainingSec) * 1000;
      if (
        opts.maxWaitMs !== undefined &&
        opts.maxWaitMs >= 0 &&
        waitMs > opts.maxWaitMs
      ) {
        throw new IntentExpiredError(endsAt, now, {
          context: {
            fillerContract: this.fillerContract,
            reason: `cooldown remaining ${remainingSec}s exceeds maxWaitMs ${opts.maxWaitMs}`,
            remainingSec: remainingSec.toString(),
          },
        });
      }
      this.#logger.info?.(
        {
          fillerContract: this.fillerContract,
          endsAt: endsAt.toString(),
          waitMs,
        },
        'waitAndWithdraw: blocking until cooldown elapsed',
      );
      await sleep(waitMs);
    }
    return await this.withdraw();
  }

  // === Internals ==========================================================

  async #read<T = bigint>(
    functionName: string,
    args: readonly unknown[],
  ): Promise<T> {
    try {
      return (await this.#publicClient.readContract({
        address: this.bondContract,
        abi: fillerBondAbi as Abi,
        functionName,
        args: args as readonly unknown[],
      })) as T;
    } catch (err) {
      throw new RPCError(
        `BondClient.${functionName} read failed: ${extractRevertReason(err)}`,
        {
          cause: err,
          context: {
            bondContract: this.bondContract,
            fillerContract: this.fillerContract,
          },
        },
      );
    }
  }

  async #write(
    functionName: string,
    args: readonly unknown[],
    opts: {
      value?: bigint;
      account: NonNullable<WalletClient['account']>;
    },
  ): Promise<Hash> {
    try {
      // viem's `WriteContractParameters` is a discriminated union (payable
      // adds `value?`); we can't narrow it through `functionName: string`,
      // so we build the bag and cast.
      const writeArgs = {
        address: this.bondContract,
        abi: fillerBondAbi as Abi,
        functionName,
        args: args as readonly unknown[],
        account: opts.account,
        chain: null,
        ...(opts.value !== undefined ? { value: opts.value } : {}),
      } as unknown as Parameters<WalletClient['writeContract']>[0];
      const tx = await this.#walletClient.writeContract(writeArgs);
      this.#logger.info?.(
        {
          tx,
          functionName,
          fillerContract: this.fillerContract,
          ...(opts.value !== undefined ? { value: opts.value.toString() } : {}),
        },
        `BondClient.${functionName} broadcast`,
      );
      return tx as Hash;
    } catch (err) {
      throw new RPCError(
        `BondClient.${functionName} write failed: ${extractRevertReason(err)}`,
        {
          cause: err,
          context: {
            bondContract: this.bondContract,
            fillerContract: this.fillerContract,
          },
        },
      );
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
