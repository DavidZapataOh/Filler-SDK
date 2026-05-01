/**
 * `IntentSource` — the abstract input side of the intent pipeline.
 *
 * The SDK is honest about reality: UniswapX's on-chain `Fill` event fires
 * AFTER an order is filled, so chain logs aren't where solver-fillable intents
 * come from. Real solvers source intents from one of:
 *
 *   1. UniswapX Trading API (REST + WS) — the canonical relayer feed.
 *   2. A self-hosted indexer that aggregates intents from API + p2p.
 *   3. A mempool-search service (specialised solvers only).
 *
 * `IntentStream` doesn't care which — it accepts any `IntentSource` and runs
 * the engine (filter routing + backpressure + lifecycle). This plan-03 design
 * lets Plan 06's IndexerClient drop in as a source without engine changes,
 * and keeps tests deterministic via `mockIntentSource`.
 *
 * Lifecycle contract:
 *   - `start(sink)` — begin pushing intents through the sink. Returns a stop
 *     fn that the engine calls when the LAST subscriber unsubscribes (or the
 *     stream closes). The stop fn MUST be idempotent.
 *   - `list(filter?)` — snapshot the current open-intent set. Best-effort:
 *     sources may return [] when they're streaming-only.
 *
 * Sources own their own retry / reconnect / backoff. The engine is a passive
 * consumer of `IntentSink.push(intent)` calls.
 */

import type { Intent, IntentFilter } from '../types';

/**
 * Push-side surface the engine exposes to a source. Sources call `push` for
 * each new intent they observe. The sink applies filters + backpressure
 * before fan-out to subscribers.
 */
export interface IntentSink {
  /**
   * Forward an intent into the engine. Returns a promise that resolves when
   * the intent has been routed to all matching subscribers (or dropped per
   * the bounded-queue policy). Sources can `await` to back-pressure
   * themselves; most fire-and-forget.
   */
  push(intent: Intent): Promise<void>;

  /**
   * True when the engine has at least one active subscriber. Sources can use
   * this to skip wasted work (e.g. don't fetch from a paid API when no one
   * is listening).
   */
  hasSubscribers(): boolean;
}

/** Source-author surface — implement this for any new intent transport. */
export interface IntentSource {
  /**
   * Begin pushing intents through `sink`. Implementations typically open a
   * WebSocket / spin a polling loop / register a listener here, and return
   * an idempotent stop function that tears everything down.
   *
   * Throws (sync) on configuration errors (bad URL, missing auth). Runtime
   * errors (network, parse) MUST be handled internally with retry/backoff —
   * a source should NEVER kill the engine via an unhandled rejection.
   */
  start(sink: IntentSink): Promise<IntentSourceStopFn> | IntentSourceStopFn;

  /**
   * Snapshot the current open-intent set, with optional filter. May return
   * `[]` for streaming-only sources that don't keep state.
   */
  list(filter?: IntentFilter): Promise<readonly Intent[]>;

  /**
   * Human-readable label for logs / metrics (e.g. `"polling:hints.filler.xyz"`,
   * `"chain-fill:0x123"`). The engine includes this in subscription-related
   * log lines.
   */
  readonly label: string;
}

export type IntentSourceStopFn = () => Promise<void> | void;

/**
 * Apply an `IntentFilter` to a single intent. Predicate filters can be async
 * (the engine awaits them); criteria filters are pure.
 */
export async function intentMatches(
  intent: Intent,
  filter: IntentFilter | undefined,
): Promise<boolean> {
  if (filter === undefined) return true;
  if (typeof filter === 'function') {
    return await filter(intent);
  }

  // Criteria object — every set field must match. Empty object matches all.
  if (filter.chainIds !== undefined && !filter.chainIds.includes(intent.chainId)) {
    return false;
  }
  if (
    filter.reactors !== undefined &&
    !filter.reactors.some((r) => sameAddress(r, intent.reactor))
  ) {
    return false;
  }
  if (
    filter.inputTokens !== undefined &&
    !filter.inputTokens.some((t) => sameAddress(t, intent.input.token))
  ) {
    return false;
  }
  if (filter.outputTokens !== undefined) {
    const outputTokens = intent.outputs.map((o) => o.token);
    const hit = filter.outputTokens.some((t) =>
      outputTokens.some((o) => sameAddress(t, o)),
    );
    if (!hit) return false;
  }
  if (
    filter.minInputAmount !== undefined &&
    intent.input.amount < filter.minInputAmount
  ) {
    return false;
  }
  return true;
}

function sameAddress(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}
