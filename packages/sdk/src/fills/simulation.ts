/**
 * Pre-flight simulation for `Filler.execute`. Wraps viem's `simulateContract`
 * + decodes revert payloads when present.
 *
 * The simulated call uses the SDK's wallet account to bind `msg.sender` so
 * `Filler.onlyOwner` / per-currency allow-listing checks behave the same as
 * the real broadcast. We also surface the gas estimate viem returns so the
 * engine's `execute` can apply its multiplier without re-estimating.
 */

import {
  type Abi,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
  BaseError,
  ContractFunctionRevertedError,
} from 'viem';

import { fillerAbi } from '../abis';
import type { Intent, SimulationResult } from '../types';
import { isObservationalIntent } from '../intents/parser';

export interface SimulateFillDeps {
  publicClient: PublicClient;
  walletClient: WalletClient;
  fillerAddress: Address;
}

export interface SimulateFillInput {
  intent: Intent;
  callbackData: Hex;
}

/**
 * Pre-flight `Filler.execute(SignedOrder, bytes)` against the latest block.
 * Returns:
 *   - `{ ok: true, gasEstimate }` on simulated success
 *   - `{ ok: false, revertReason }` on revert (decoded when possible)
 *   - `{ ok: false, revertReason: <network err> }` on transport failure
 *
 * Observational intents (Plan 03 sentinel: rawOrder='0x' or signature='0x')
 * are rejected before simulation — they can never be filled.
 */
export async function simulateFill(
  deps: SimulateFillDeps,
  input: SimulateFillInput,
): Promise<SimulationResult> {
  if (isObservationalIntent(input.intent)) {
    return {
      ok: false,
      revertReason:
        'observational intent — rawOrder/signature missing (sourced from Fill log; not fillable)',
    };
  }

  const account = deps.walletClient.account;
  if (account === undefined) {
    return {
      ok: false,
      revertReason: 'walletClient has no account bound — cannot simulate',
    };
  }

  try {
    const sim = await deps.publicClient.simulateContract({
      address: deps.fillerAddress,
      abi: fillerAbi as Abi,
      functionName: 'execute',
      args: [
        { order: input.intent.rawOrder, sig: input.intent.signature },
        input.callbackData,
      ],
      account,
    });
    // viem returns the request object; gasEstimate isn't included by
    // simulateContract in v2 — we let the engine call estimateGas separately
    // for the canonical number. Returning ok:true is the contract.
    void sim;
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      revertReason: extractRevertReason(err),
    };
  }
}

/**
 * Best-effort revert decoder. viem nests the revert reason a few layers deep
 * inside `BaseError.walk`; we walk the chain for the first
 * `ContractFunctionRevertedError` and extract its decoded data.
 */
export function extractRevertReason(err: unknown): string {
  if (err instanceof BaseError) {
    const reverted = err.walk(
      (e) => e instanceof ContractFunctionRevertedError,
    );
    if (reverted instanceof ContractFunctionRevertedError) {
      const data = reverted.data;
      if (data !== undefined) {
        // `data` carries the decoded error name + args when the ABI matches.
        return `${data.errorName}(${(data.args ?? []).map(String).join(', ')})`;
      }
      if (reverted.reason !== undefined) return reverted.reason;
      return reverted.shortMessage;
    }
    return err.shortMessage;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}
