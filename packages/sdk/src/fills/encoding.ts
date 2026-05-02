/**
 * ABI encoding for `FillParams[]` — the bytes blob the SDK passes to
 * `Filler.execute(SignedOrder, bytes callbackData)`. The Filler forwards it
 * to `Reactor.executeWithCallback`, which calls back into
 * `Filler.reactorCallback(ResolvedOrder[], bytes callbackData)` where the
 * Solidity decoder reads it back as `FillParams[]`.
 *
 * **Critical invariant**: this encoding MUST match
 * `contracts/src/libraries/FillParams.sol:FillParams` field-for-field. Any
 * drift breaks the on-chain decode and the fill reverts (the Reactor will
 * also slash the bond per the slashing path in Sprint 01).
 *
 * Solidity struct (FillParams.sol):
 *   struct FillParams {
 *     PoolKey poolKey;            // (address,address,uint24,int24,address)
 *     Currency inputCurrency;     // address
 *     Currency outputCurrency;    // address
 *     uint256 inputAmount;
 *     uint256 outputAmount;
 *     bool zeroForOne;
 *     int24 tickLower;
 *     int24 tickUpper;
 *     uint128 liquidityDelta;
 *     uint256 feesCaptured;
 *     uint256 deadline;
 *   }
 *
 * The encoded bytes are a single-element abi.encode of `FillParams[]` so the
 * Solidity reactor callback can `abi.decode(callbackData, (FillParams[]))`
 * matching the same shape.
 */

import {
  type Hex,
  decodeAbiParameters,
  encodeAbiParameters,
  parseAbiParameters,
} from 'viem';

import type { FillParams } from '../types';

/**
 * Single source of truth for the `FillParams[]` ABI string. Used by the
 * encoder + decoder + the test round-trip. If you ever need to change this,
 * the Solidity struct ALSO needs to change in lock-step.
 */
export const FILL_PARAMS_ARRAY_ABI = parseAbiParameters([
  // The PoolKey tuple has 5 fields (currency0, currency1, fee, tickSpacing, hooks).
  // Currency in v4 is `type Currency is address`, so encoded as address.
  'FillParams[] params',
  'struct FillParams { PoolKey poolKey; address inputCurrency; address outputCurrency; uint256 inputAmount; uint256 outputAmount; bool zeroForOne; int24 tickLower; int24 tickUpper; uint128 liquidityDelta; uint256 feesCaptured; uint256 deadline; }',
  'struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }',
]);

/**
 * Encode `FillParams[]` for the Filler's reactor callback. Returns the bytes
 * blob ready to pass as the second argument to `Filler.execute(SignedOrder, bytes)`.
 */
export function encodeCallbackData(paramsArray: readonly FillParams[]): Hex {
  return encodeAbiParameters(FILL_PARAMS_ARRAY_ABI, [
    paramsArray.map((p) => ({
      poolKey: {
        currency0: p.poolKey.currency0,
        currency1: p.poolKey.currency1,
        fee: p.poolKey.fee,
        tickSpacing: p.poolKey.tickSpacing,
        hooks: p.poolKey.hooks,
      },
      inputCurrency: p.inputCurrency,
      outputCurrency: p.outputCurrency,
      inputAmount: p.inputAmount,
      outputAmount: p.outputAmount,
      zeroForOne: p.zeroForOne,
      tickLower: p.tickLower,
      tickUpper: p.tickUpper,
      liquidityDelta: p.liquidityDelta,
      feesCaptured: p.feesCaptured,
      deadline: p.deadline,
    })),
  ]);
}

/**
 * Decode bytes back into `FillParams[]`. Used by the round-trip test + by
 * any consumer that needs to inspect the encoded blob (e.g. tx replay).
 */
export function decodeCallbackData(data: Hex): readonly FillParams[] {
  const [decoded] = decodeAbiParameters(FILL_PARAMS_ARRAY_ABI, data);
  return decoded.map((p) => ({
    poolKey: {
      currency0: p.poolKey.currency0,
      currency1: p.poolKey.currency1,
      fee: p.poolKey.fee,
      tickSpacing: p.poolKey.tickSpacing,
      hooks: p.poolKey.hooks,
    },
    inputCurrency: p.inputCurrency,
    outputCurrency: p.outputCurrency,
    inputAmount: p.inputAmount,
    outputAmount: p.outputAmount,
    zeroForOne: p.zeroForOne,
    tickLower: p.tickLower,
    tickUpper: p.tickUpper,
    liquidityDelta: p.liquidityDelta,
    feesCaptured: p.feesCaptured,
    deadline: p.deadline,
  }));
}
