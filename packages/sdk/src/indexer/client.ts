/**
 * `IndexerClient` — typed HTTP client for the JIT-hints API
 * (`@filler-sdk/jit-hints`). Wraps `/depth` + `/health` + (eventually)
 * `/depth/stream`.
 *
 * **Implementation status (Plan 02):** the class shape + dependency-injected
 * `fetch` slot are real (so tests can pass a mock fetch) and the URL
 * construction helpers are wired. The actual request loop (retries, circuit
 * breaker, lru-cache for hot queries, SSE reader) lands in **Plan 06**.
 *
 * Until then `depth` and `health` reject with a Plan 06 pointer. The throwing
 * surface keeps the loud-failure posture from
 * `01-package-architecture-progress.md` §5.3.
 */

import { FillerError } from '../errors';
import type {
  ChainStatus,
  DepthHint,
  DepthQuery,
  FillerLogger,
  IndexerSurface,
} from '../types';

export interface IndexerClientConfig {
  /** Base URL — no trailing slash. */
  baseUrl: string;
  /** Optional bearer token for hosted-indexer auth. Empty string = none. */
  authToken: string;
  /** Per-request timeout (ms). */
  timeoutMs: number;
  /** Logger. */
  logger: FillerLogger;
  /**
   * Optional fetch override — defaults to `globalThis.fetch`. Tests pass a
   * mock; production runs against Node 20+ / Bun's native fetch.
   */
  fetch?: typeof fetch;
}

export class IndexerClient implements IndexerSurface {
  readonly #baseUrl: string;
  readonly #authToken: string;
  readonly #timeoutMs: number;
  readonly #logger: FillerLogger;
  readonly #fetch: typeof fetch;

  constructor(cfg: IndexerClientConfig) {
    this.#baseUrl = cfg.baseUrl.replace(/\/+$/, '');
    this.#authToken = cfg.authToken;
    this.#timeoutMs = cfg.timeoutMs;
    this.#logger = cfg.logger.child?.({ component: 'IndexerClient' }) ?? cfg.logger;
    this.#fetch = cfg.fetch ?? globalThis.fetch;
  }

  /** Resolved base URL (no trailing slash). */
  get baseUrl(): string {
    return this.#baseUrl;
  }

  /** Per-request timeout. */
  get timeoutMs(): number {
    return this.#timeoutMs;
  }

  /** True if an auth token is configured. */
  get authenticated(): boolean {
    return this.#authToken.length > 0;
  }

  depth(_query: DepthQuery): Promise<DepthHint> {
    return Promise.reject(
      new FillerError(
        'UNKNOWN',
        'IndexerClient.depth is implemented in Plan 06 (HTTP client with retries + lru cache)',
      ),
    );
  }

  health(): Promise<{ status: 'ok' | 'degraded'; chains: readonly ChainStatus[] }> {
    return Promise.reject(
      new FillerError(
        'UNKNOWN',
        'IndexerClient.health is implemented in Plan 06',
      ),
    );
  }
}
