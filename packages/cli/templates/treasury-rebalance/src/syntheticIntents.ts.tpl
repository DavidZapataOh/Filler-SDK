/**
 * Synthetic intent generator for the demo mode.
 *
 * Production solvers subscribe to a real intent feed (UniswapX Trading API
 * or jit-hints indexer). Demo mode emits intents programmatically so the
 * dashboard "money counter" works without a live chain + relayer.
 *
 * **Honest scope**: synthetic intents have placeholder `rawOrder` /
 * `signature` bytes — they're STRUCTURALLY valid `Intent` objects, but
 * passing them to the real `createFillerFromPrivateKey().submitFill()`
 * would fail (Sprint 03 Plan 03's `isObservationalIntent` check rejects
 * fakes). Demo mode in `filler.ts` uses `createMockFiller` from
 * `@filler-sdk/sdk/testing` so prepare + submit return mock results
 * without touching chain. Production mode (`DEMO_MODE=false`) skips this
 * generator entirely + uses real intent subscription.
 *
 * Sizing: $10K – $5M per trade, modelled on Karpatkey's published Aave
 * treasury rebalance flow (Q3 2025). Intents are denominated in 6-decimal
 * USDC for arithmetic simplicity; output amount is 99% of input (1%
 * spread modelled).
 */

import { EventEmitter } from 'node:events';

import type { Address } from 'viem';
import { keccak256, toHex } from 'viem';

import type { Intent } from '@filler-sdk/sdk';

import type { TreasuryConfig } from './treasury';

const MIN_TRADE_USD = 10_000;
const MAX_TRADE_USD = 5_000_000;

interface GeneratorContext {
  treasuryAddress: Address;
  reactorAddress: Address;
  tokenAddresses: Map<string, Address>;
  intervalSec: number;
}

export interface SyntheticIntentEvents {
  intent: (intent: Intent) => void;
}

export interface SyntheticIntentGenerator {
  start(): void;
  stop(): void;
  on<K extends keyof SyntheticIntentEvents>(
    event: K,
    listener: SyntheticIntentEvents[K],
  ): SyntheticIntentGenerator;
  /** Trigger a single intent immediately (useful for tests + warm-start). */
  emitOnce(): void;
  /** True when start() has been called and stop() hasn't. */
  readonly running: boolean;
}

export function createSyntheticIntentGenerator(
  treasury: TreasuryConfig,
  reactorAddress: Address,
): SyntheticIntentGenerator {
  const ctx: GeneratorContext = {
    treasuryAddress: treasury.TREASURY_ADDRESS as Address,
    reactorAddress,
    tokenAddresses: treasury.TOKEN_ADDRESSES,
    intervalSec: treasury.DEMO_INTERVAL_SEC,
  };
  const emitter = new EventEmitter();
  let timer: NodeJS.Timeout | undefined;
  let nonce = 0n;
  let blockHeight = 21_000_000n;

  function pickPair(): [Address, Address] | null {
    const tickers = [...ctx.tokenAddresses.keys()];
    if (tickers.length < 2) return null;
    const i = Math.floor(Math.random() * tickers.length);
    let j = Math.floor(Math.random() * tickers.length);
    while (j === i) j = Math.floor(Math.random() * tickers.length);
    const inputT = tickers[i];
    const outputT = tickers[j];
    if (inputT === undefined || outputT === undefined) return null;
    const inputA = ctx.tokenAddresses.get(inputT);
    const outputA = ctx.tokenAddresses.get(outputT);
    if (inputA === undefined || outputA === undefined) return null;
    return [inputA, outputA];
  }

  function emitOnce(): void {
    const pair = pickPair();
    if (pair === null) return;
    const [inputAddr, outputAddr] = pair;

    // Realistic Aave-style rebalance: $10K – $5M, denominated in USDC (6 dec).
    const tradeUSD = MIN_TRADE_USD + Math.random() * (MAX_TRADE_USD - MIN_TRADE_USD);
    const inputAmount = BigInt(Math.floor(tradeUSD * 1_000_000));
    // 1% spread — realistic for a treasury rebalance flow on majors.
    const outputAmount = (inputAmount * 99n) / 100n;

    nonce++;
    blockHeight++;

    const orderHash = keccak256(
      toHex(`${ctx.treasuryAddress}-${nonce.toString(16)}`),
    );

    const intent: Intent = {
      reactor: ctx.reactorAddress,
      swapper: ctx.treasuryAddress,
      nonce,
      deadline: BigInt(Math.floor(Date.now() / 1000) + 600),
      additionalValidationContract: '0x0000000000000000000000000000000000000000',
      additionalValidationData: '0x',
      input: { token: inputAddr, amount: inputAmount },
      outputs: [
        {
          token: outputAddr,
          amount: outputAmount,
          recipient: ctx.treasuryAddress,
        },
      ],
      chainId: 130,
      observedAt: blockHeight,
      txHash: keccak256(toHex(`tx-${nonce.toString(16)}`)),
      orderHash,
      // Structurally valid bytes; semantically synthetic. Demo mode's
      // MockFiller accepts these; real createFillerFromPrivateKey would
      // reject via isObservationalIntent.
      rawOrder: ('0x' + 'cd'.repeat(160)) as `0x${string}`,
      signature: ('0x' + 'ef'.repeat(65)) as `0x${string}`,
    };

    emitter.emit('intent', intent);
  }

  return {
    start() {
      if (timer !== undefined) return;
      // Fire one immediately so the dashboard sees something on connect.
      emitOnce();
      timer = setInterval(emitOnce, ctx.intervalSec * 1000);
    },
    stop() {
      if (timer === undefined) return;
      clearInterval(timer);
      timer = undefined;
    },
    on(event, listener) {
      emitter.on(event, listener);
      return this;
    },
    emitOnce,
    get running() {
      return timer !== undefined;
    },
  };
}
