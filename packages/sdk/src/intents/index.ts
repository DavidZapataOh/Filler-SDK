/**
 * `@filler-sdk/sdk/intents` — internal barrel.
 *
 * The intent stream surface is composed of:
 *   - `IntentStream`            engine (filter routing + backpressure)
 *   - `IntentSource` interface  pluggable transport
 *   - `pollingIntentSource()`   default: REST-poll an /intents endpoint
 *   - `chainFillIntentSource()` observational: tails Reactor `Fill` logs
 *   - `mockIntentSource()`      test helper (also exported via /testing)
 *   - `parseIntentFromLog`      Fill event decoder + observational helpers
 *
 * Plan 03 ships all of the above. Plans 06 (IndexerClient) + 09 (Testing)
 * pull from these primitives without changing the engine.
 */

export type { Intent, IntentFilter, IntentSurface } from '../types';

export { IntentStream } from './stream';
export type { DropPolicy, IntentStreamConfig } from './stream';

export {
  type IntentSink,
  type IntentSource,
  type IntentSourceStopFn,
  intentMatches,
} from './source';

export {
  createPollingIntentSource,
  type PollingIntentSourceConfig,
} from './pollingSource';

export {
  createChainFillIntentSource,
  type ChainFillIntentSourceConfig,
} from './chainFillSource';

export {
  createMockIntentSource,
  type MockIntentSource,
  type MockIntentSourceOptions,
} from './mockSource';

export {
  decodeFillEvent,
  type FillEventDecoded,
  intentFromFillLog,
  isObservationalIntent,
  reactorFillAbi,
} from './parser';
