/**
 * `IntentStream` — engine. Receives intents from a pluggable `IntentSource`
 * (Plan 03), routes each intent through the matching subscriber filters, and
 * applies per-subscriber backpressure.
 *
 * Lifecycle:
 *   - constructed empty, no source attached, no subscribers
 *   - first `subscribe()` triggers `source.start(sink)` (lazy boot)
 *   - additional `subscribe()` calls add to the subscriber set without
 *     restarting the source
 *   - last `unsubscribe()` does NOT auto-stop the source — sources are
 *     stopped only on `close()`. This avoids start/stop thrashing for
 *     consumers that bounce subscriptions.
 *   - `close()` stops the source + drops every subscriber (idempotent)
 *
 * Backpressure:
 *   - Each subscriber has a bounded FIFO queue (`maxQueueSize`, default 100).
 *   - When the queue is full, drop policy decides: `'oldest'` (shift front,
 *     default) or `'newest'` (skip the inbound). Each drop bumps
 *     `droppedTotal`.
 *   - The drain loop awaits `onIntent(intent)` sequentially per subscriber so
 *     a slow handler doesn't fan-in unboundedly. Errors thrown by the
 *     handler are caught + logged; the subscription survives.
 *
 * The engine is intentionally framework-free: no event emitters, no rxjs.
 * This keeps the bundle small (the entire intents/ directory is ~3 KB
 * brotlied) and deterministic for tests.
 */

import { FillerError } from '../errors';
import type {
  FillerLogger,
  Intent,
  IntentFilter,
  IntentSurface,
} from '../types';
import {
  type IntentSink,
  type IntentSource,
  type IntentSourceStopFn,
  intentMatches,
} from './source';

export type DropPolicy = 'oldest' | 'newest';

export interface IntentStreamConfig {
  /**
   * viem `PublicClient`. Used by chain-log-based sources + tx fetchers.
   * Typed `unknown` here; narrowed at use site by the source impl.
   */
  publicClient: unknown;
  /** Reactor whose `OrderEvent`/`Fill` logs we tail (when a chain source is wired). */
  reactorAddress: `0x${string}`;
  /** Logger; child of the parent `Filler` logger. */
  logger: FillerLogger;
  /** Optional source — if absent, the stream produces no intents until one is attached. */
  source?: IntentSource;
  /** Per-subscriber queue size. Default 100. */
  maxQueueSize?: number;
  /** Backpressure drop policy. Default 'oldest'. */
  dropPolicy?: DropPolicy;
}

interface SubscriberState {
  filter: IntentFilter;
  onIntent: (intent: Intent) => void | Promise<void>;
  queue: Intent[];
  draining: boolean;
  dropped: number;
  removed: boolean;
}

const DEFAULT_MAX_QUEUE = 100;
const DEFAULT_DROP_POLICY: DropPolicy = 'oldest';

export class IntentStream implements IntentSurface {
  readonly #publicClient: unknown;
  readonly #reactorAddress: `0x${string}`;
  readonly #logger: FillerLogger;
  readonly #source: IntentSource | undefined;
  readonly #maxQueueSize: number;
  readonly #dropPolicy: DropPolicy;
  readonly #subscribers = new Set<SubscriberState>();
  #sourceStop: IntentSourceStopFn | null = null;
  #starting = false;
  #closed = false;
  #droppedTotal = 0;
  #lastIntentAt: bigint | undefined;

  constructor(cfg: IntentStreamConfig) {
    this.#publicClient = cfg.publicClient;
    this.#reactorAddress = cfg.reactorAddress;
    this.#logger = cfg.logger.child?.({ component: 'IntentStream' }) ?? cfg.logger;
    this.#source = cfg.source;
    this.#maxQueueSize = cfg.maxQueueSize ?? DEFAULT_MAX_QUEUE;
    this.#dropPolicy = cfg.dropPolicy ?? DEFAULT_DROP_POLICY;
  }

  // === Read-only accessors (tests + observability) ========================

  /** Reactor address being tailed. */
  get reactorAddress(): `0x${string}` {
    return this.#reactorAddress;
  }

  /** Underlying public client (typed `unknown`; consumers narrow). */
  get publicClient(): unknown {
    return this.#publicClient;
  }

  /** Number of active subscriptions. */
  get subscriptionCount(): number {
    return this.#subscribers.size;
  }

  /** Total intents dropped across all subscribers since boot. */
  get droppedTotal(): number {
    return this.#droppedTotal;
  }

  /** Block number / observed timestamp of the most recent intent. */
  get lastIntentAt(): bigint | undefined {
    return this.#lastIntentAt;
  }

  /** True if a source is wired (vs. running in "no-feed" mode). */
  get hasSource(): boolean {
    return this.#source !== undefined;
  }

  /** Source label (for logs / metrics). `undefined` if no source. */
  get sourceLabel(): string | undefined {
    return this.#source?.label;
  }

  // === Subscription lifecycle =============================================

  subscribe(
    filter: IntentFilter,
    onIntent: (intent: Intent) => void | Promise<void>,
  ): () => void {
    if (this.#closed) {
      throw new FillerError(
        'UNKNOWN',
        'IntentStream is closed; create a new Filler if you need to resubscribe',
      );
    }
    const sub: SubscriberState = {
      filter,
      onIntent,
      queue: [],
      draining: false,
      dropped: 0,
      removed: false,
    };
    this.#subscribers.add(sub);
    this.#logger.debug?.(
      {
        reactorAddress: this.#reactorAddress,
        total: this.#subscribers.size,
        sourceLabel: this.sourceLabel,
      },
      'IntentStream.subscribe',
    );

    // Lazy-boot the source on first subscription. Awaiting in subscribe()
    // would be a breaking signature change — fire-and-forget instead, log
    // any startup error.
    void this.#ensureSourceStarted().catch((err) => {
      this.#logger.error(
        { err, sourceLabel: this.sourceLabel },
        'IntentStream source start failed',
      );
    });

    return () => {
      if (sub.removed) return;
      sub.removed = true;
      this.#subscribers.delete(sub);
      this.#logger.debug?.(
        { remaining: this.#subscribers.size },
        'IntentStream.unsubscribe',
      );
    };
  }

  list(filter?: IntentFilter): Promise<readonly Intent[]> {
    if (this.#source === undefined) {
      // No source = no snapshot. We deliberately resolve to [] instead of
      // throwing because "no source" is a valid configuration (some users
      // bring their own subscription via a custom source that's wired
      // separately). The throw-on-missing-source contract belongs to
      // higher-level helpers.
      return Promise.resolve([]);
    }
    return Promise.resolve(this.#source.list(filter));
  }

  /**
   * Stop the source + drop every subscriber. Idempotent; safe from a SIGTERM
   * handler.
   */
  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    const stop = this.#sourceStop;
    this.#sourceStop = null;
    if (stop !== null) {
      try {
        await stop();
      } catch (err) {
        this.#logger.warn?.(
          { err, sourceLabel: this.sourceLabel },
          'IntentStream source stop threw',
        );
      }
    }
    this.#subscribers.clear();
    this.#logger.info?.(
      { droppedTotal: this.#droppedTotal },
      'IntentStream closed',
    );
  }

  // === Internal source-boot helper ========================================

  async #ensureSourceStarted(): Promise<void> {
    if (this.#source === undefined) return;
    if (this.#sourceStop !== null) return;
    if (this.#starting) return;
    this.#starting = true;
    try {
      const sink: IntentSink = {
        push: (intent) => this.#ingest(intent),
        hasSubscribers: () => this.#subscribers.size > 0,
      };
      const stop = await this.#source.start(sink);
      if (this.#closed) {
        // Someone closed us while the source was starting; tear it down.
        try {
          await stop();
        } catch {
          // ignore
        }
        return;
      }
      this.#sourceStop = stop;
      this.#logger.info?.(
        { sourceLabel: this.#source.label },
        'IntentStream source started',
      );
    } finally {
      this.#starting = false;
    }
  }

  // === Internal fan-out / backpressure ====================================

  async #ingest(intent: Intent): Promise<void> {
    this.#lastIntentAt = intent.observedAt;
    if (this.#subscribers.size === 0) return;

    // Snapshot subscribers so concurrent unsubscribe doesn't break iteration.
    const subs = [...this.#subscribers];
    await Promise.all(subs.map((s) => this.#routeToSubscriber(s, intent)));
  }

  async #routeToSubscriber(
    sub: SubscriberState,
    intent: Intent,
  ): Promise<void> {
    if (sub.removed) return;
    let matches: boolean;
    try {
      matches = await intentMatches(intent, sub.filter);
    } catch (err) {
      this.#logger.warn?.(
        { err, orderHash: intent.orderHash },
        'IntentStream filter threw — treating as non-match',
      );
      return;
    }
    if (!matches) return;

    // Bounded queue.
    if (sub.queue.length >= this.#maxQueueSize) {
      if (this.#dropPolicy === 'oldest') {
        sub.queue.shift();
      } else {
        // 'newest' — drop the inbound, keep the queue.
        sub.dropped++;
        this.#droppedTotal++;
        return;
      }
      sub.dropped++;
      this.#droppedTotal++;
    }
    sub.queue.push(intent);
    void this.#drain(sub);
  }

  async #drain(sub: SubscriberState): Promise<void> {
    if (sub.draining) return;
    sub.draining = true;
    try {
      while (!sub.removed && sub.queue.length > 0) {
        const intent = sub.queue.shift();
        if (intent === undefined) break;
        try {
          await sub.onIntent(intent);
        } catch (err) {
          this.#logger.error?.(
            { err, orderHash: intent.orderHash },
            'IntentStream subscriber handler threw — subscription survives',
          );
        }
      }
    } finally {
      sub.draining = false;
    }
  }
}
