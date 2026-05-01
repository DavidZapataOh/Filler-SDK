/**
 * `mockIntentSource` — deterministic test helper.
 *
 * Designed for vitest: hand the source to an `IntentStream` constructor, then
 * call `pushIntent(intent)` to drive it through the engine. Also tracks
 * `started`/`stopped`/`startCount` so tests can assert the lifecycle.
 *
 * NOT exported through the package's public entry — only via
 * `@filler-sdk/sdk/testing` (Plan 09 will pull this in alongside MockFiller +
 * IntentBuilder).
 */

import type { Intent, IntentFilter } from '../types';

import {
  type IntentSink,
  type IntentSource,
  type IntentSourceStopFn,
  intentMatches,
} from './source';

export interface MockIntentSource extends IntentSource {
  /** Push an intent through the sink. Resolves when the engine has routed it. */
  pushIntent(intent: Intent): Promise<void>;
  /** Replace the snapshot returned by `list(filter?)`. */
  setListSnapshot(snapshot: readonly Intent[]): void;
  /** True from the moment `start()` returns until the stop fn resolves. */
  readonly started: boolean;
  /** Total times `start()` has been called (lazy-boot tests). */
  readonly startCount: number;
  /** Total times the stop fn has been invoked. */
  readonly stopCount: number;
  /** Last sink seen by `start`. Useful for tests asserting hasSubscribers. */
  readonly lastSink: IntentSink | null;
}

export interface MockIntentSourceOptions {
  /** Initial snapshot returned by `list()`. */
  initial?: readonly Intent[];
  /** Custom label. Defaults to `'mock'`. */
  label?: string;
  /** If true, `start()` throws synchronously — for source-error tests. */
  throwOnStart?: boolean;
}

export function createMockIntentSource(
  opts: MockIntentSourceOptions = {},
): MockIntentSource {
  let snapshot: readonly Intent[] = opts.initial ?? [];
  let sink: IntentSink | null = null;
  let started = false;
  let startCount = 0;
  let stopCount = 0;

  const stop: IntentSourceStopFn = () => {
    if (!started) return;
    started = false;
    sink = null;
    stopCount++;
  };

  const source: MockIntentSource = {
    label: opts.label ?? 'mock',

    start: (incomingSink) => {
      if (opts.throwOnStart === true) {
        throw new Error('mockIntentSource: forced start failure');
      }
      sink = incomingSink;
      started = true;
      startCount++;
      return stop;
    },

    list: async (filter?: IntentFilter) => {
      if (filter === undefined) return snapshot;
      const matches: Intent[] = [];
      for (const intent of snapshot) {
        if (await intentMatches(intent, filter)) matches.push(intent);
      }
      return matches;
    },

    pushIntent: async (intent) => {
      if (sink === null) {
        throw new Error(
          'mockIntentSource.pushIntent called before start() — wire it into a stream and subscribe first',
        );
      }
      await sink.push(intent);
    },

    setListSnapshot: (next) => {
      snapshot = next;
    },

    get started() {
      return started;
    },
    get startCount() {
      return startCount;
    },
    get stopCount() {
      return stopCount;
    },
    get lastSink() {
      return sink;
    },
  };

  return source;
}
