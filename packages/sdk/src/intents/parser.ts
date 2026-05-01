/**
 * Decoder for UniswapX `Fill` events. Converts a viem `Log` (with the
 * minimal Fill ABI applied) into a partial `Intent` shape.
 *
 * **Fill is observational, NOT fillable.** The Reactor emits `Fill` AFTER an
 * order has been settled — by the time our SDK sees it, the order has already
 * been won by some other solver. This decoder is useful for:
 *   - analytics ("which orders cleared in the last block?")
 *   - dashboards (the OpenSolver demo uses this for the SPREAD CAPTURED counter)
 *   - solver-self-attribution ("did THIS solver win that order?")
 *
 * Fill carries: `(bytes32 orderHash, address filler, address swapper, uint256 nonce)`.
 * That's nowhere near enough to reconstruct a `SignedOrder` (raw order bytes
 * + signature aren't on chain). The decoder returns a partial `Intent` with:
 *   - the canonical orderHash + swapper + nonce + reactor
 *   - txHash + observedAt from the log envelope
 *   - placeholder zero values for input/output amounts + currencies
 *   - rawOrder + signature both `'0x'` (sentinel — callers MUST treat as unfillable)
 *
 * Higher-level code (Plan 04 FillEngine) checks for the `0x` sentinel before
 * attempting to submit a fill; the engine throws a typed `FillerError` when
 * asked to fill a "Fill-event-derived" intent.
 */

import type { Address, Hash, Log } from 'viem';
import { decodeEventLog, parseAbi } from 'viem';

import type { ChainId } from '../chains';
import { FillerError } from '../errors';
import type { Intent } from '../types';

/**
 * Minimal V2DutchOrderReactor ABI fragment. We hand-write this because:
 *   - The reactor source isn't checked in to our `contracts/` (it's in
 *     `v4-periphery`'s UniswapX deployment).
 *   - The Fill event signature is stable across V2 / V2.1 / future minor
 *     versions — we'd have to track it anyway.
 *   - parseAbi from viem is type-checked; future drift produces a type error
 *     not a silent decode failure.
 */
export const reactorFillAbi = parseAbi([
  'event Fill(bytes32 indexed orderHash, address indexed filler, address indexed swapper, uint256 nonce)',
]);

export interface FillEventDecoded {
  orderHash: Hash;
  filler: Address;
  swapper: Address;
  nonce: bigint;
}

/** Decode a single Fill log into typed args. Throws on non-Fill logs. */
export function decodeFillEvent(log: Log): FillEventDecoded {
  try {
    const decoded = decodeEventLog({
      abi: reactorFillAbi,
      data: log.data,
      topics: log.topics,
      eventName: 'Fill',
    });
    return {
      orderHash: decoded.args.orderHash,
      filler: decoded.args.filler,
      swapper: decoded.args.swapper,
      nonce: decoded.args.nonce,
    };
  } catch (cause) {
    throw new FillerError(
      'UNKNOWN',
      `failed to decode Fill log at ${log.transactionHash ?? '<no-tx>'}`,
      { cause },
    );
  }
}

/**
 * Convert a decoded Fill event into a partial `Intent`. The result is
 * observation-only — `rawOrder` + `signature` are sentinels, output amounts
 * are zero. Callers must NOT attempt to submit fills against these intents;
 * the FillEngine will reject them with a typed error.
 */
export function intentFromFillLog(
  log: Log,
  decoded: FillEventDecoded,
  reactor: Address,
  chainId: ChainId,
): Intent {
  const ZERO_ADDR = '0x0000000000000000000000000000000000000000' as const;
  return {
    reactor,
    swapper: decoded.swapper,
    nonce: decoded.nonce,
    deadline: 0n,
    additionalValidationContract: ZERO_ADDR,
    additionalValidationData: '0x',
    input: { token: ZERO_ADDR, amount: 0n },
    outputs: [],
    chainId,
    observedAt: log.blockNumber ?? 0n,
    txHash: (log.transactionHash ?? '0x') as Hash,
    orderHash: decoded.orderHash,
    rawOrder: '0x',
    signature: '0x',
  };
}

/**
 * Type guard — true if an Intent was derived from a Fill log (vs. from a
 * relayer feed). Plan 04's FillEngine uses this to reject submit attempts
 * with a typed error.
 */
export function isObservationalIntent(intent: Intent): boolean {
  return intent.rawOrder === '0x' || intent.signature === '0x';
}
