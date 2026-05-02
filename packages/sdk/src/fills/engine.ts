/**
 * `FillEngine` — orchestrates the prepare → simulate → execute pipeline.
 *
 * Responsibilities:
 *   - `prepare(intent)`   — finds a pool via the indexer, queries the depth
 *                           hint, validates ticks via `calibrateTickRange`,
 *                           pre-flight simulates. Returns null when the intent
 *                           is unfillable (expired / no pool / unprofitable /
 *                           reverts in simulation / tick invariants fail).
 *   - `simulate(intent, params)` — direct `eth_call` against `Filler.execute`,
 *                           wraps `simulation.ts`.
 *   - `execute(intent, params, opts)` — encodes the FillParams[] callback,
 *                           estimates gas, applies a multiplier, broadcasts via
 *                           the wallet client, waits for the receipt, and
 *                           returns a `FillResult`. Retries with exponential
 *                           backoff on transient RPC failures.
 *
 * Plan 04 ships the orchestrator. Plans that fill in the data-source impls
 * (Plan 06 IndexerClient.findPool/depth) make the engine end-to-end useful;
 * before Plan 06, `prepare` returns null because `findPool` rejects.
 *
 * Loud-failure posture: `execute` rejects observational intents (Plan 03
 * sentinel `rawOrder`/`signature` === '0x') with `BroadcastFailedError`. The
 * engine never silently swallows.
 */

import {
  type Abi,
  type Address,
  type Hash,
  type Hex,
  type PublicClient,
  type WalletClient,
} from 'viem';

import { fillerAbi } from '../abis';
import {
  BroadcastFailedError,
  ConfigInvalidError,
  IntentExpiredError,
  RPCError,
  SimulationRevertedError,
} from '../errors';
import type { ChainId } from '../chains';
import type { IndexerClient } from '../indexer/client';
import { isObservationalIntent } from '../intents/parser';
import type { KeeperHubClient } from '../keeperhub/client';
import type {
  ChainContractAddresses,
  FillerLogger,
  FillParams,
  FillResult,
  FillSurface,
  Intent,
  SimulationResult,
  SubmitFillOptions,
} from '../types';

import { calibrateTickRange } from './tickCalibration';
import { encodeCallbackData } from './encoding';
import { extractRevertReason, simulateFill } from './simulation';

const DEFAULT_GAS_MULTIPLIER = 1.2;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_BASE_MS = 500;
const DEFAULT_RECEIPT_TIMEOUT_MS = 60_000;
const DEFAULT_DEPTH_SLIPPAGE_BPS = 50;

export interface FillEngineConfig {
  publicClient: unknown;
  walletClient: unknown;
  addresses: Pick<ChainContractAddresses, 'filler' | 'reactor' | 'poolManager'>;
  indexer: IndexerClient;
  keeperHub: KeeperHubClient | null;
  logger: FillerLogger;
  /** Optional override for the chain id stamped onto fill results. */
  chainId?: ChainId;
}

export class FillEngine implements FillSurface {
  readonly #publicClient: PublicClient;
  readonly #walletClient: WalletClient;
  readonly #addresses: FillEngineConfig['addresses'];
  readonly #indexer: IndexerClient;
  readonly #keeperHub: KeeperHubClient | null;
  readonly #logger: FillerLogger;

  constructor(cfg: FillEngineConfig) {
    this.#publicClient = cfg.publicClient as PublicClient;
    this.#walletClient = cfg.walletClient as WalletClient;
    this.#addresses = cfg.addresses;
    this.#indexer = cfg.indexer;
    this.#keeperHub = cfg.keeperHub;
    this.#logger = cfg.logger.child?.({ component: 'FillEngine' }) ?? cfg.logger;
  }

  get fillerAddress(): Address {
    return this.#addresses.filler;
  }

  get keeperHubEnabled(): boolean {
    return this.#keeperHub !== null;
  }

  // === prepare ============================================================

  async prepare(intent: Intent): Promise<FillParams | null> {
    const log = this.#logger;

    if (isObservationalIntent(intent)) {
      log.debug?.(
        { orderHash: intent.orderHash },
        'prepare: observational intent skipped (sourced from Fill log)',
      );
      return null;
    }

    // 1. Expiration check — cheap, do first.
    const now = BigInt(Math.floor(Date.now() / 1000));
    if (intent.deadline <= now) {
      log.debug?.(
        { orderHash: intent.orderHash, deadline: intent.deadline.toString() },
        'prepare: intent expired',
      );
      return null;
    }

    // 2. Pool resolution — queries indexer.findPool (Plan 06 wires it).
    const inputToken = intent.input.token;
    const firstOutput = intent.outputs[0];
    if (firstOutput === undefined) {
      log.debug?.({ orderHash: intent.orderHash }, 'prepare: intent has no outputs');
      return null;
    }
    const outputToken = firstOutput.token;
    let pool;
    try {
      pool = await this.#indexer.findPool(inputToken, outputToken, intent.chainId);
    } catch (err) {
      log.warn?.(
        { err: errMsg(err), orderHash: intent.orderHash },
        'prepare: indexer.findPool failed',
      );
      return null;
    }
    if (pool === null) {
      log.debug?.(
        { input: inputToken, output: outputToken, chainId: intent.chainId },
        'prepare: no pool indexed for token pair',
      );
      return null;
    }

    // 3. Direction. PoolKey ordering: currency0 < currency1 (enforced in v4).
    const zeroForOne =
      inputToken.toLowerCase() === pool.currency0.toLowerCase();

    // 4. Depth hint.
    let hint;
    try {
      hint = await this.#indexer.depth({
        pool: pool.id,
        size: intent.input.amount,
        zeroForOne,
        slippageBps: DEFAULT_DEPTH_SLIPPAGE_BPS,
      });
    } catch (err) {
      log.warn?.(
        { err: errMsg(err), orderHash: intent.orderHash },
        'prepare: indexer.depth failed',
      );
      return null;
    }

    // 5. Profitability gate — rule out fills where the indexer's expected fee
    // capture is too small to cover the swapper's required output.
    if (hint.hint.expectedFeeCapture <= 0n) {
      log.debug?.(
        { orderHash: intent.orderHash },
        'prepare: indexer reports zero expected fee capture',
      );
      return null;
    }

    // 6. Tick calibration. Plan 04 = pass-through validator; Plan 05 = real math.
    let calibrated;
    try {
      calibrated = calibrateTickRange({ pool, hint, intent });
    } catch (err) {
      log.warn?.(
        { err: errMsg(err), orderHash: intent.orderHash, poolId: pool.id },
        'prepare: tick calibration rejected',
      );
      return null;
    }

    // 7. Build FillParams.
    const params: FillParams = {
      poolKey: {
        currency0: pool.currency0,
        currency1: pool.currency1,
        fee: pool.fee,
        tickSpacing: pool.tickSpacing,
        hooks: pool.hooks,
      },
      inputCurrency: inputToken,
      outputCurrency: outputToken,
      inputAmount: intent.input.amount,
      outputAmount: firstOutput.amount,
      zeroForOne,
      tickLower: calibrated.tickLower,
      tickUpper: calibrated.tickUpper,
      liquidityDelta: calibrated.liquidityDelta,
      feesCaptured: hint.hint.expectedFeeCapture,
      deadline: intent.deadline,
    };

    // 8. Pre-flight simulate.
    const sim = await this.simulate(intent, params);
    if (!sim.ok) {
      log.warn?.(
        { orderHash: intent.orderHash, revertReason: sim.revertReason },
        'prepare: simulation failed',
      );
      return null;
    }

    return params;
  }

  // === simulate ===========================================================

  simulate(intent: Intent, params: FillParams): Promise<SimulationResult> {
    const callbackData = encodeCallbackData([params]);
    return simulateFill(
      {
        publicClient: this.#publicClient,
        walletClient: this.#walletClient,
        fillerAddress: this.#addresses.filler,
      },
      { intent, callbackData },
    );
  }

  // === execute ============================================================

  async execute(
    intent: Intent,
    params: FillParams,
    options?: SubmitFillOptions,
  ): Promise<FillResult> {
    if (isObservationalIntent(intent)) {
      throw new BroadcastFailedError(
        'cannot fill an observational intent (rawOrder/signature missing)',
        { context: { orderHash: intent.orderHash } },
      );
    }
    const now = BigInt(Math.floor(Date.now() / 1000));
    if (intent.deadline <= now) {
      throw new IntentExpiredError(intent.deadline, now, {
        context: { orderHash: intent.orderHash },
      });
    }

    const log = this.#logger;
    const callbackData = encodeCallbackData([params]);
    const useKeeperHub =
      options?.useKeeperHub === true && this.#keeperHub !== null;

    // 1. Estimate gas + apply multiplier.
    const gasEstimate = await this.#estimateGas(intent, callbackData);
    const multiplier = options?.gasMultiplier ?? DEFAULT_GAS_MULTIPLIER;
    const gasLimit = applyGasMultiplier(gasEstimate, multiplier);

    log.info?.(
      {
        orderHash: intent.orderHash,
        gasEstimate: gasEstimate.toString(),
        gasLimit: gasLimit.toString(),
        gasMultiplier: multiplier,
        route: useKeeperHub ? 'keeperhub' : 'direct',
      },
      'execute: broadcasting fill',
    );

    if (useKeeperHub) {
      if (this.#keeperHub === null) {
        // Defensive: useKeeperHub already checked keeperHub !== null above,
        // but TS narrows once we re-enter the branch. Surface a clean error.
        throw new ConfigInvalidError(
          'submitFill: useKeeperHub=true but no KeeperHub client configured',
        );
      }
      try {
        return await this.#keeperHub.submitFill(intent, params, gasLimit);
      } catch (err) {
        // KeeperHubClient already wraps to BroadcastFailedError /
        // TimeoutError / RPCError / ConfigInvalidError. Re-throw without
        // wrapping again so callers get the typed signal directly.
        throw err;
      }
    }

    return this.#submitDirect(intent, params, callbackData, gasLimit);
  }

  // === Private helpers ====================================================

  async #estimateGas(intent: Intent, callbackData: Hex): Promise<bigint> {
    const account = this.#walletClient.account;
    if (account === undefined) {
      throw new ConfigInvalidError(
        'walletClient has no account bound — cannot estimate gas',
      );
    }
    try {
      return await this.#publicClient.estimateContractGas({
        address: this.#addresses.filler,
        abi: fillerAbi as Abi,
        functionName: 'execute',
        args: [
          { order: intent.rawOrder, sig: intent.signature },
          callbackData,
        ],
        account,
      });
    } catch (err) {
      throw new SimulationRevertedError(
        `gas estimation reverted: ${extractRevertReason(err)}`,
        { cause: err, revertReason: extractRevertReason(err) },
      );
    }
  }

  async #submitDirect(
    intent: Intent,
    params: FillParams,
    callbackData: Hex,
    gasLimit: bigint,
  ): Promise<FillResult> {
    const log = this.#logger;
    const account = this.#walletClient.account;
    if (account === undefined) {
      throw new ConfigInvalidError(
        'walletClient has no account bound — cannot broadcast',
      );
    }

    let attempt = 0;
    let lastErr: unknown;

    while (attempt < DEFAULT_MAX_ATTEMPTS) {
      try {
        attempt++;
        const txHash = await this.#walletClient.writeContract({
          address: this.#addresses.filler,
          abi: fillerAbi as Abi,
          functionName: 'execute',
          args: [
            { order: intent.rawOrder, sig: intent.signature },
            callbackData,
          ],
          gas: gasLimit,
          account,
          chain: null,
        });
        log.info?.({ txHash, attempt }, 'execute: tx submitted');

        const receipt = await this.#publicClient.waitForTransactionReceipt({
          hash: txHash,
          timeout: DEFAULT_RECEIPT_TIMEOUT_MS,
        });

        if (receipt.status !== 'success') {
          throw new BroadcastFailedError(`fill reverted on chain: ${txHash}`, {
            context: { txHash, blockNumber: receipt.blockNumber.toString() },
          });
        }

        return {
          txHash: txHash as Hash,
          blockNumber: receipt.blockNumber,
          effectiveGasPriceWei: receipt.effectiveGasPrice,
          gasUsed: receipt.gasUsed,
          feeCapturedAmount: params.feesCaptured,
          intent,
          params,
        };
      } catch (err) {
        lastErr = err;
        // BroadcastFailedError is a final-state failure — don't retry it.
        if (err instanceof BroadcastFailedError) {
          throw err;
        }
        log.warn?.(
          {
            attempt,
            err: errMsg(err),
            orderHash: intent.orderHash,
          },
          'execute: submit attempt failed',
        );
        if (attempt < DEFAULT_MAX_ATTEMPTS) {
          await sleep(DEFAULT_RETRY_BASE_MS * attempt);
        }
      }
    }

    throw new RPCError(
      `all submit attempts exhausted (${DEFAULT_MAX_ATTEMPTS} attempts)`,
      { cause: lastErr, context: { orderHash: intent.orderHash } },
    );
  }
}

// === pure helpers (exported for tests) ====================================

/**
 * Apply a fractional gas multiplier to a bigint estimate. Rounds up so we
 * never go below the multiplier (a 1.2× bump on 100k gas always yields
 * ≥ 120k, never 119,999 from rounding). Multiplier <= 1 is rejected because
 * it'd lower the limit below the simulator's number — almost certainly a
 * caller bug.
 */
export function applyGasMultiplier(estimate: bigint, multiplier: number): bigint {
  if (!Number.isFinite(multiplier) || multiplier < 1) {
    throw new ConfigInvalidError(
      `gasMultiplier must be a finite number >= 1; got ${multiplier}`,
    );
  }
  // Multiply via 4-decimal scaling so 1.2 → 12000, 1.05 → 10500.
  const scale = 10_000n;
  const scaled = BigInt(Math.ceil(multiplier * Number(scale)));
  return (estimate * scaled + scale - 1n) / scale;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
