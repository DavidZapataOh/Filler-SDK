/**
 * `IndexerClient` — typed HTTP + SSE client for `@filler-sdk/jit-hints`.
 *
 * Endpoints consumed (matching jit-hints' route + serializer surface):
 *
 *   GET  /pools?chain=<id>&token=<addr>     — paginated pool list
 *   GET  /pools/:id                          — single-pool detail (unused — kept
 *                                              as an extension point for future)
 *   GET  /depth?pool=...&size=...&...        — JIT depth hint
 *   GET  /depth/stream?pool=...&size=...     — SSE stream of depth hints
 *   GET  /health                             — process liveness + per-chain status
 *
 * Wire format conventions:
 *   - bigints encoded as decimal strings ("1234567890123456789").
 *   - Addresses lowercase, 0x-prefixed.
 *   - Pool ids are 32-byte hex (66 chars total).
 *
 * Loud-failure posture:
 *   - Non-2xx responses → `IndexerError` with HTTP status.
 *   - Schema mismatches → `IndexerError` with the Zod issue list in `context`.
 *   - Network / abort failures wrap into `IndexerError` (originating
 *     `cause` is preserved for log structured-fields).
 *   - SSE auto-reconnect happens internally; only persistent failures bubble
 *     to the consumer's logger (subscription stays alive).
 *
 * `findPool` strategy:
 *   1. Query `/pools?chain=<id>&token=<input>&limit=200`.
 *   2. Filter for pools whose `currency0` OR `currency1` matches `output`.
 *   3. Sort: hookless first, then liquidity desc, then fee asc → deterministic
 *      "best pool" choice.
 *   4. Return null when no pool matches.
 *
 * Limitation: the 200-pool cap is a hackathon-grade truncation. Chains with
 * thousands of v4 pools could miss exotic pairs if neither token is in the
 * "first 200 by indexer order." Documented in §5 of the progress doc.
 */

import type { Address } from 'viem';
import { z } from 'zod';

import type { ChainId } from '../chains';
import { IndexerError } from '../errors';
import type {
  ChainStatus,
  DepthHint,
  DepthQuery,
  FillerLogger,
  IndexerSurface,
  PoolInfo,
} from '../types';

const FIND_POOL_PAGE_LIMIT = 200;
const SSE_RECONNECT_BASE_MS = 500;
const SSE_RECONNECT_MAX_MS = 30_000;
const RETRY_BASE_MS = 250;
const RETRY_MAX_ATTEMPTS = 3;

// === Wire schemas =========================================================

// Address / pool-id schemas — tolerate `0X`/`0x` prefix (per spec it's
// always `0x`, but some indexer middleware uppercases the whole string in
// transit); the SDK normalises with `.toLowerCase()` before address compare.
const AddressString = z
  .string()
  .regex(/^0[xX][a-fA-F0-9]{40}$/, 'must be 0x-prefixed 20-byte hex');
const PoolIdString = z
  .string()
  .regex(/^0[xX][a-fA-F0-9]{64}$/, 'must be 0x-prefixed 32-byte hex');

const SerializedPoolSchema = z.object({
  id: PoolIdString,
  chainId: z.number().int().positive(),
  currency0: AddressString,
  currency1: AddressString,
  fee: z.number().int().nonnegative(),
  tickSpacing: z.number().int().positive(),
  hooks: AddressString,
  sqrtPriceX96: z.string(),
  liquidity: z.string(),
  tick: z.number().int(),
  initializedAt: z.string(),
  updatedAt: z.string(),
});

const PoolListSchema = z.object({
  pools: z.array(SerializedPoolSchema),
  count: z.number().int().nonnegative().optional(),
  limit: z.number().int().positive().optional(),
  offset: z.number().int().nonnegative().optional(),
});

const SerializedDepthHintSchema = z.object({
  pool: PoolIdString,
  hint: z.object({
    tickLower: z.number().int(),
    tickUpper: z.number().int(),
    liquidityDelta: z.string(),
    expectedFeeCapture: z.string(),
    expectedSlippageBps: z.number().int().optional(),
    expectedGasOverhead: z.string().optional(),
    estimatedNetProfit: z.string().optional(),
  }),
  poolState: z
    .object({
      currentTick: z.number().int(),
      currentSqrtPrice: z.string(),
    })
    .optional(),
});

const SerializedHealthSchema = z.object({
  status: z.enum(['ok', 'degraded']).default('ok'),
  chains: z
    .array(
      z.object({
        chainId: z.number().int().positive(),
        latestBlock: z.string().nullable(),
        lastUpdatedAt: z.string().nullable(),
      }),
    )
    .default([]),
});

// === Config ==============================================================

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

// === Client ==============================================================

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

  // === Read-only accessors (tests + observability) ========================

  get baseUrl(): string {
    return this.#baseUrl;
  }
  get timeoutMs(): number {
    return this.#timeoutMs;
  }
  get authenticated(): boolean {
    return this.#authToken.length > 0;
  }

  // === HTTP methods =======================================================

  async findPool(
    input: Address,
    output: Address,
    chainId: ChainId,
  ): Promise<PoolInfo | null> {
    const url = new URL(`${this.#baseUrl}/pools`);
    url.searchParams.set('chain', String(chainId));
    url.searchParams.set('token', input.toLowerCase());
    url.searchParams.set('limit', String(FIND_POOL_PAGE_LIMIT));

    const json = await this.#getJson(url, 'findPool');
    const parsed = PoolListSchema.safeParse(json);
    if (!parsed.success) {
      throw new IndexerError(`findPool: malformed response`, {
        context: { issues: parsed.error.issues, url: url.toString() },
      });
    }

    const outputLower = output.toLowerCase();
    const matches = parsed.data.pools.filter(
      (p) =>
        p.chainId === chainId &&
        (p.currency0.toLowerCase() === outputLower ||
          p.currency1.toLowerCase() === outputLower),
    );
    if (matches.length === 0) return null;

    // Sort: hookless first, then liquidity desc, then fee asc.
    const ZERO_HOOKS = '0x0000000000000000000000000000000000000000';
    matches.sort((a, b) => {
      const aHookless = a.hooks.toLowerCase() === ZERO_HOOKS ? 0 : 1;
      const bHookless = b.hooks.toLowerCase() === ZERO_HOOKS ? 0 : 1;
      if (aHookless !== bHookless) return aHookless - bHookless;
      const aLiq = BigInt(a.liquidity);
      const bLiq = BigInt(b.liquidity);
      if (aLiq !== bLiq) return aLiq < bLiq ? 1 : -1;
      return a.fee - b.fee;
    });

    const best = matches[0];
    if (best === undefined) return null;
    return {
      id: best.id as `0x${string}`,
      currency0: best.currency0 as Address,
      currency1: best.currency1 as Address,
      fee: best.fee,
      tickSpacing: best.tickSpacing,
      hooks: best.hooks as Address,
      sqrtPriceX96: BigInt(best.sqrtPriceX96),
      liquidity: BigInt(best.liquidity),
      tick: best.tick,
    };
  }

  async depth(query: DepthQuery): Promise<DepthHint> {
    const url = new URL(`${this.#baseUrl}/depth`);
    url.searchParams.set('pool', query.pool);
    url.searchParams.set('size', query.size.toString());
    url.searchParams.set('zeroForOne', String(query.zeroForOne));
    if (query.slippageBps !== undefined) {
      url.searchParams.set('slippageBps', String(query.slippageBps));
    }
    if (query.gasPriceGwei !== undefined) {
      url.searchParams.set('gasPriceGwei', String(query.gasPriceGwei));
    }

    const json = await this.#getJson(url, 'depth');
    return decodeDepthHint(json);
  }

  async health(): Promise<{
    status: 'ok' | 'degraded';
    chains: readonly ChainStatus[];
  }> {
    const url = new URL(`${this.#baseUrl}/health`);
    const json = await this.#getJson(url, 'health');
    const parsed = SerializedHealthSchema.safeParse(json);
    if (!parsed.success) {
      throw new IndexerError('health: malformed response', {
        context: { issues: parsed.error.issues, url: url.toString() },
      });
    }
    return {
      status: parsed.data.status,
      chains: parsed.data.chains.map((c) => ({
        chainId: c.chainId as ChainId,
        latestBlock: c.latestBlock === null ? 0n : BigInt(c.latestBlock),
        lastUpdatedAt: c.lastUpdatedAt === null ? 0n : BigInt(c.lastUpdatedAt),
      })),
    };
  }

  subscribeDepth(
    query: DepthQuery,
    onHint: (hint: DepthHint) => void | Promise<void>,
  ): () => void {
    const url = new URL(`${this.#baseUrl}/depth/stream`);
    url.searchParams.set('pool', query.pool);
    url.searchParams.set('size', query.size.toString());
    url.searchParams.set('zeroForOne', String(query.zeroForOne));
    if (query.slippageBps !== undefined) {
      url.searchParams.set('slippageBps', String(query.slippageBps));
    }

    const abort = new AbortController();
    const stopped = { current: false };

    const loop = async (): Promise<void> => {
      let attempt = 0;
      while (!stopped.current) {
        try {
          await this.#streamOnce(url, onHint, abort.signal);
          // Stream closed cleanly — wait a beat before reconnecting so we
          // don't hammer a server that's intentionally cycling connections,
          // and so the event loop can yield to other timers (otherwise a
          // mock-closed stream creates a tight reconnect loop).
          attempt = 0;
          if (stopped.current) return;
          await sleep(SSE_RECONNECT_BASE_MS, abort.signal);
        } catch (err) {
          if (stopped.current) return;
          if (isAbortError(err)) return;
          attempt++;
          const backoff = Math.min(
            SSE_RECONNECT_BASE_MS * 2 ** (attempt - 1),
            SSE_RECONNECT_MAX_MS,
          );
          this.#logger.warn?.(
            {
              err: errorMessage(err),
              attempt,
              backoffMs: backoff,
              url: url.toString(),
            },
            'subscribeDepth: stream error, reconnecting',
          );
          await sleep(backoff, abort.signal);
        }
      }
    };

    void loop().catch((err) => {
      this.#logger.error?.(
        { err: errorMessage(err) },
        'subscribeDepth: fatal loop error',
      );
    });

    return () => {
      if (stopped.current) return;
      stopped.current = true;
      abort.abort();
    };
  }

  // === Internals ==========================================================

  /**
   * GET + JSON-decode with timeout, auth, retry on transient failures.
   * Throws `IndexerError` on persistent failure.
   */
  async #getJson(url: URL, label: string): Promise<unknown> {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= RETRY_MAX_ATTEMPTS; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), this.#timeoutMs);
      try {
        const headers: Record<string, string> = { accept: 'application/json' };
        if (this.#authToken.length > 0) {
          headers.authorization = `Bearer ${this.#authToken}`;
        }
        const res = await this.#fetch(url.toString(), {
          headers,
          signal: ctrl.signal,
        });
        if (res.status === 404) {
          // 404 is a contract response for "not indexed"; bubble as IndexerError
          // with status so callers can branch.
          throw new IndexerError(`${label}: not found (404)`, {
            status: 404,
            context: { url: url.toString() },
          });
        }
        if (res.status >= 400 && res.status < 500) {
          // Client-error — don't retry.
          throw new IndexerError(
            `${label}: HTTP ${res.status} ${res.statusText}`,
            { status: res.status, context: { url: url.toString() } },
          );
        }
        if (!res.ok) {
          // 5xx — retryable.
          throw new IndexerError(
            `${label}: HTTP ${res.status} ${res.statusText}`,
            { status: res.status, context: { url: url.toString() } },
          );
        }
        return await res.json();
      } catch (err) {
        lastErr = err;
        if (err instanceof IndexerError && err.status !== undefined && err.status < 500) {
          // 4xx (incl. 404) is final.
          throw err;
        }
        if (attempt < RETRY_MAX_ATTEMPTS) {
          this.#logger.debug?.(
            {
              err: errorMessage(err),
              attempt,
              url: url.toString(),
            },
            `${label}: retrying`,
          );
          await sleep(RETRY_BASE_MS * attempt, ctrl.signal);
        }
      } finally {
        clearTimeout(timer);
      }
    }
    if (lastErr instanceof IndexerError) throw lastErr;
    throw new IndexerError(`${label}: failed after ${RETRY_MAX_ATTEMPTS} attempts`, {
      cause: lastErr,
      context: { url: url.toString() },
    });
  }

  /**
   * Open the SSE stream + drain it until completion or abort. Each successful
   * decode invokes `onHint`. Caller (the loop in `subscribeDepth`) handles
   * reconnect.
   */
  async #streamOnce(
    url: URL,
    onHint: (hint: DepthHint) => void | Promise<void>,
    signal: AbortSignal,
  ): Promise<void> {
    const headers: Record<string, string> = {
      accept: 'text/event-stream',
      'cache-control': 'no-cache',
    };
    if (this.#authToken.length > 0) {
      headers.authorization = `Bearer ${this.#authToken}`;
    }
    const res = await this.#fetch(url.toString(), { headers, signal });
    if (!res.ok) {
      throw new IndexerError(
        `subscribeDepth: HTTP ${res.status} ${res.statusText}`,
        { status: res.status, context: { url: url.toString() } },
      );
    }
    const body = res.body;
    if (body === null) {
      throw new IndexerError('subscribeDepth: response has no body', {
        context: { url: url.toString() },
      });
    }
    const reader = body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let currentEvent = 'message';
    let currentData = '';

    while (!signal.aborted) {
      const { value, done } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by blank lines. Process one frame at a time.
      let nlIdx = buffer.indexOf('\n');
      while (nlIdx !== -1) {
        const line = buffer.slice(0, nlIdx).replace(/\r$/, '');
        buffer = buffer.slice(nlIdx + 1);
        if (line === '') {
          // Frame end — dispatch.
          if (currentData.length > 0) {
            try {
              const json: unknown = JSON.parse(currentData);
              const hint = decodeDepthHint(json);
              await onHint(hint);
            } catch (err) {
              this.#logger.warn?.(
                { err: errorMessage(err), event: currentEvent },
                'subscribeDepth: failed to decode frame',
              );
            }
          }
          currentEvent = 'message';
          currentData = '';
        } else if (line.startsWith('event:')) {
          currentEvent = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          // SSE allows multiple data lines per frame; concatenate with \n.
          if (currentData.length > 0) currentData += '\n';
          currentData += line.slice(5).trim();
        } else if (line.startsWith(':')) {
          // Comment / heartbeat — ignore.
        }
        nlIdx = buffer.indexOf('\n');
      }
    }
  }
}

// === pure helpers (exported for tests) ====================================

export function decodeDepthHint(json: unknown): DepthHint {
  const parsed = SerializedDepthHintSchema.safeParse(json);
  if (!parsed.success) {
    throw new IndexerError('depth: malformed response', {
      context: { issues: parsed.error.issues },
    });
  }
  const data = parsed.data;
  const hint: DepthHint['hint'] = {
    tickLower: data.hint.tickLower,
    tickUpper: data.hint.tickUpper,
    liquidityDelta: BigInt(data.hint.liquidityDelta),
    expectedFeeCapture: BigInt(data.hint.expectedFeeCapture),
  };
  if (data.hint.expectedSlippageBps !== undefined) {
    hint.expectedSlippageBps = data.hint.expectedSlippageBps;
  }
  if (data.hint.expectedGasOverhead !== undefined) {
    hint.expectedGasOverhead = BigInt(data.hint.expectedGasOverhead);
  }
  if (data.hint.estimatedNetProfit !== undefined) {
    hint.estimatedNetProfit = BigInt(data.hint.estimatedNetProfit);
  }
  const result: DepthHint = {
    pool: data.pool as `0x${string}`,
    hint,
  };
  if (data.poolState !== undefined) {
    result.poolState = {
      currentTick: data.poolState.currentTick,
      currentSqrtPrice: BigInt(data.poolState.currentSqrtPrice),
    };
  }
  return result;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      resolve();
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function isAbortError(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.name === 'AbortError' || err.message.toLowerCase().includes('abort'))
  );
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
