/**
 * Intent stream surface — full implementation in Plan 03.
 *
 * Currently exports the public types only; `IntentStream` (the class that
 * turns the indexer's SSE feed into typed events) lands when Plan 03 wires
 * the SSE reader. Solver authors who want to pre-import the type can do so
 * today, and the import path won't change when the implementation arrives.
 */

export type { Intent, IntentFilter, IntentSurface } from '../types';

export { IntentStream, type IntentStreamConfig } from './stream';
