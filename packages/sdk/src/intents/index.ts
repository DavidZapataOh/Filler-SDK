/**
 * Intent stream surface — full implementation in Plan 03.
 *
 * Currently exports the public types only; `IntentStream` (the class that
 * turns the indexer's SSE feed into typed events) lands when Plan 03 wires
 * the SSE reader. Solver authors who want to pre-import the type can do so
 * today, and the import path won't change when the implementation arrives.
 */

export type { Intent, IntentFilter, IntentSurface } from '../types';

/**
 * Internal placeholder so tsup has something to bundle. Removed when Plan 03
 * lands the real `IntentStream` class.
 *
 * @internal
 */
export const __INTENTS_PLACEHOLDER = Symbol.for('@filler-sdk/sdk:intents:v0');
