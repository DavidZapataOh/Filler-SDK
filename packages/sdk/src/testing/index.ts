/**
 * Testing utilities — full implementation in Plan 09.
 *
 * Solver authors will import from here in their vitest / mocha suites:
 *
 *   import { createMockFiller, createMockIndexer, IntentBuilder } from
 *     '@filler-sdk/sdk/testing';
 *
 * The full toolkit (Anvil fork helper, mock indexer with deterministic
 * depth hints, intent builder for fixtures, time-warp helpers) lands in
 * Plan 09. Today this entry exposes only the type signatures so downstream
 * authors can wire the import path.
 */

import type { Filler, Intent, IntentFilter } from '../types';

/**
 * Builder for synthetic `Intent` fixtures. The chained API lands in Plan 09;
 * we expose the type signature today so test files can author with it.
 */
export interface IntentBuilder {
  withSwapper(addr: `0x${string}`): IntentBuilder;
  withInput(token: `0x${string}`, amount: bigint): IntentBuilder;
  withOutput(token: `0x${string}`, amount: bigint): IntentBuilder;
  withDeadline(secondsFromNow: number): IntentBuilder;
  build(): Intent;
}

/**
 * Mock filler — drop-in replacement for the real `Filler` handle in tests.
 * Captures any call to `intents.subscribe` / `fills.execute` and exposes
 * helpers for assertions. Real impl in Plan 09.
 */
export interface MockFiller extends Filler {
  /** All intents the mock has emitted to subscribers. */
  emittedIntents: readonly Intent[];
  /** Programmatically push an intent through the subscribe channel. */
  pushIntent(intent: Intent): void;
  /** Inspect the active subscription filters. */
  activeFilters(): readonly IntentFilter[];
}

/**
 * @internal
 */
export const __TESTING_PLACEHOLDER = Symbol.for('@filler-sdk/sdk:testing:v0');
