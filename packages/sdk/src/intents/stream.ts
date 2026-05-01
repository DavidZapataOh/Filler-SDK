/**
 * `IntentStream` — listens for UniswapX `OrderEvent` logs from the configured
 * Reactor and pushes typed `Intent` objects to subscribers.
 *
 * **Implementation status (Plan 02):** the class shape, constructor, and
 * subscription bookkeeping are real and tested. The actual log-decoder
 * pipeline (eth_getLogs polling vs. WebSocket subscription, `OrderEvent`
 * topic decoding, multi-output normalization) lands in **Plan 03**.
 *
 * The Plan 02 contract is:
 *   - You can construct the stream with a public client + reactor address.
 *   - You can call `subscribe(filter, onIntent)` and get back an unsubscribe
 *     function. The subscription is captured + applied once Plan 03 wires
 *     the real log feed.
 *   - `list()` and the actual log decoding throw `FillerError(UNKNOWN)` with
 *     a Plan 03 pointer until then. The throwing surface is documented in
 *     `01-package-architecture-progress.md` §5.3.
 *
 * Why ship the class now (vs. waiting for Plan 03)?
 *   - Downstream packages (`apps/dashboard`, `examples/*`, `create-filler`)
 *     can import the class today and the import path won't churn.
 *   - The `createFiller` factory wires it in Plan 02, so swapping the
 *     internals in Plan 03 is a single-file diff.
 */

import { FillerError } from '../errors';
import type {
  FillerLogger,
  Intent,
  IntentFilter,
  IntentSurface,
} from '../types';

export interface IntentStreamConfig {
  /** viem `PublicClient`. Typed as `unknown` here to keep the SDK surface
   *  free of viem's deep generics; narrowed at use site. */
  publicClient: unknown;
  /** Reactor whose `OrderEvent` logs we tail. */
  reactorAddress: `0x${string}`;
  /** Logger; child of the parent `Filler` logger. */
  logger: FillerLogger;
}

interface Subscription {
  filter: IntentFilter;
  onIntent: (intent: Intent) => void | Promise<void>;
}

export class IntentStream implements IntentSurface {
  readonly #publicClient: unknown;
  readonly #reactorAddress: `0x${string}`;
  readonly #logger: FillerLogger;
  readonly #subscriptions = new Set<Subscription>();
  #closed = false;

  constructor(cfg: IntentStreamConfig) {
    this.#publicClient = cfg.publicClient;
    this.#reactorAddress = cfg.reactorAddress;
    this.#logger = cfg.logger.child?.({ component: 'IntentStream' }) ?? cfg.logger;
  }

  /** Reactor address being tailed. Exposed for tests + telemetry. */
  get reactorAddress(): `0x${string}` {
    return this.#reactorAddress;
  }

  /** Number of active subscriptions. Useful for /metrics + tests. */
  get subscriptionCount(): number {
    return this.#subscriptions.size;
  }

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
    const sub: Subscription = { filter, onIntent };
    this.#subscriptions.add(sub);
    this.#logger.debug?.(
      { reactorAddress: this.#reactorAddress, total: this.#subscriptions.size },
      'IntentStream.subscribe',
    );
    let removed = false;
    return () => {
      if (removed) return;
      removed = true;
      this.#subscriptions.delete(sub);
      this.#logger.debug?.(
        { remaining: this.#subscriptions.size },
        'IntentStream.unsubscribe',
      );
    };
  }

  list(_filter?: IntentFilter): Promise<readonly Intent[]> {
    return Promise.reject(
      new FillerError(
        'UNKNOWN',
        'IntentStream.list is implemented in Plan 03 (log decoder + indexer fallback)',
      ),
    );
  }

  /**
   * Stop the stream + drop all subscriptions. Idempotent; safe to call from a
   * SIGTERM handler. Real impl (closing the underlying WS / polling timer)
   * lands in Plan 03; today this just flips the `closed` flag.
   */
  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    this.#subscriptions.clear();
    this.#logger.info?.({ component: 'IntentStream' }, 'IntentStream closed');
  }
}
