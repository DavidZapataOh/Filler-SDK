/**
 * `pollingIntentSource` — REST-poll an intent feed (default URL points at the
 * SDK's hosted indexer when Plan 06 ships `/intents`; users can override to
 * point at the UniswapX Trading API or any compatible endpoint).
 *
 * Wire format the source expects from the URL:
 *
 *   GET ${baseUrl}/intents[?since=<iso8601>] →
 *   {
 *     "intents": Intent[],
 *     "cursor": string | null
 *   }
 *
 * Where `Intent` follows the SDK's canonical shape — bigint fields encoded
 * as decimal strings (the source decodes them back).
 *
 * Reconnect / retry:
 *   - Successful responses reset the backoff to base.
 *   - Non-2xx, network errors, JSON parse failures all use exponential
 *     backoff: `base * 2^attempt` capped at `maxBackoffMs`.
 *   - Stop is cooperative — the AbortController interrupts the in-flight
 *     fetch and the loop breaks out cleanly.
 *
 * Deliberate non-features (with rationale):
 *   - No SSE / WebSocket — Plan 06 will add a `streamingIntentSource` once
 *     the indexer's SSE endpoint exists. For Plan 03 we want a source that
 *     works against any compliant REST endpoint with zero infra.
 *   - No persistent cursor across process restarts. The `since` cursor is
 *     held in memory; a restart re-pulls the most-recent window (idempotent
 *     since the engine de-dupes by `orderHash` at the subscriber level —
 *     which Plan 04's FillEngine.execute will also do).
 */

import { z } from 'zod';

import type { ChainId } from '../chains';
import type { FillerLogger, Intent } from '../types';
import {
  type IntentSink,
  type IntentSource,
  type IntentSourceStopFn,
} from './source';

export interface PollingIntentSourceConfig {
  /** Base URL — must end without a trailing slash. */
  baseUrl: string;
  /** Optional bearer token. */
  authToken?: string;
  /** Poll interval in ms when the feed is healthy. Default 1500. */
  intervalMs?: number;
  /** Per-request timeout in ms. Default 5000. */
  timeoutMs?: number;
  /** Backoff base in ms. Default 500. */
  backoffBaseMs?: number;
  /** Backoff cap in ms. Default 30_000. */
  maxBackoffMs?: number;
  /** Logger. */
  logger: FillerLogger;
  /** fetch override for tests. Defaults to global fetch. */
  fetch?: typeof fetch;
}

const DEFAULTS = {
  intervalMs: 1500,
  timeoutMs: 5000,
  backoffBaseMs: 500,
  maxBackoffMs: 30_000,
};

// Wire shape — bigints encoded as decimal strings. We decode at receipt.
const TokenAmountWire = z.object({
  token: z.string(),
  amount: z.string(),
});

const ResolvedOutputWire = z.object({
  token: z.string(),
  amount: z.string(),
  recipient: z.string(),
});

const IntentWire = z.object({
  reactor: z.string(),
  swapper: z.string(),
  nonce: z.string(),
  deadline: z.string(),
  additionalValidationContract: z.string(),
  additionalValidationData: z.string(),
  input: TokenAmountWire,
  outputs: z.array(ResolvedOutputWire),
  chainId: z.number(),
  observedAt: z.string(),
  txHash: z.string(),
  orderHash: z.string(),
  rawOrder: z.string(),
  signature: z.string(),
});

const PollResponseWire = z.object({
  intents: z.array(IntentWire),
  cursor: z.string().nullable().optional(),
});

export function createPollingIntentSource(
  cfg: PollingIntentSourceConfig,
): IntentSource {
  const baseUrl = cfg.baseUrl.replace(/\/+$/, '');
  const intervalMs = cfg.intervalMs ?? DEFAULTS.intervalMs;
  const timeoutMs = cfg.timeoutMs ?? DEFAULTS.timeoutMs;
  const backoffBaseMs = cfg.backoffBaseMs ?? DEFAULTS.backoffBaseMs;
  const maxBackoffMs = cfg.maxBackoffMs ?? DEFAULTS.maxBackoffMs;
  const log = cfg.logger.child?.({ component: 'pollingIntentSource' }) ?? cfg.logger;
  const fetchImpl = cfg.fetch ?? globalThis.fetch;

  let cursor: string | null = null;

  return {
    label: `polling:${baseUrl}`,

    start: (sink) => {
      const abort = new AbortController();
      const stopped = { current: false };

      const loop = async (): Promise<void> => {
        let attempt = 0;
        while (!stopped.current) {
          try {
            // Skip work when no subscribers — saves API quota. We still tick
            // the loop to keep the abort responsive.
            if (!sink.hasSubscribers()) {
              await sleep(intervalMs, abort.signal);
              continue;
            }
            const intents = await fetchOnce(
              fetchImpl,
              baseUrl,
              cursor,
              cfg.authToken,
              timeoutMs,
              abort.signal,
            );
            attempt = 0;
            for (const intent of intents.intents) {
              if (stopped.current) break;
              await sink.push(intent);
            }
            if (intents.cursor !== undefined) cursor = intents.cursor ?? cursor;
            await sleep(intervalMs, abort.signal);
          } catch (err) {
            if (stopped.current) return;
            if (isAbortError(err)) return;
            attempt++;
            const backoff = Math.min(
              backoffBaseMs * 2 ** (attempt - 1),
              maxBackoffMs,
            );
            log.warn?.(
              { err: errorMessage(err), attempt, backoffMs: backoff, baseUrl },
              'pollingIntentSource: fetch failed, backing off',
            );
            await sleep(backoff, abort.signal);
          }
        }
      };

      // Fire-and-forget the loop; capture errors at the top.
      void loop().catch((err) => {
        log.error?.({ err: errorMessage(err) }, 'pollingIntentSource loop crashed');
      });

      const stop: IntentSourceStopFn = async () => {
        if (stopped.current) return;
        stopped.current = true;
        abort.abort();
      };
      return stop;
    },

    list: async (_filter) => {
      // Best-effort snapshot via a one-shot fetch with an empty cursor.
      // Filter evaluation happens at the engine layer.
      try {
        const res = await fetchOnce(
          fetchImpl,
          baseUrl,
          null,
          cfg.authToken,
          timeoutMs,
          undefined,
        );
        return res.intents;
      } catch (err) {
        log.warn?.(
          { err: errorMessage(err), baseUrl },
          'pollingIntentSource.list failed — returning []',
        );
        return [];
      }
    },
  };
}

async function fetchOnce(
  fetchImpl: typeof fetch,
  baseUrl: string,
  cursor: string | null,
  authToken: string | undefined,
  timeoutMs: number,
  upstreamSignal: AbortSignal | undefined,
): Promise<{ intents: Intent[]; cursor?: string | null }> {
  const url = new URL(`${baseUrl}/intents`);
  if (cursor !== null) url.searchParams.set('since', cursor);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const onAbort = (): void => ctrl.abort();
  upstreamSignal?.addEventListener('abort', onAbort);

  try {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (authToken !== undefined && authToken !== '') {
      headers.authorization = `Bearer ${authToken}`;
    }
    const res = await fetchImpl(url.toString(), {
      headers,
      signal: ctrl.signal,
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} from ${url.toString()}`);
    }
    const json: unknown = await res.json();
    const parsed = PollResponseWire.parse(json);
    const intents = parsed.intents.map(decodeIntent);
    return { intents, cursor: parsed.cursor ?? null };
  } finally {
    clearTimeout(timer);
    upstreamSignal?.removeEventListener('abort', onAbort);
  }
}

function decodeIntent(wire: z.infer<typeof IntentWire>): Intent {
  return {
    reactor: wire.reactor as `0x${string}`,
    swapper: wire.swapper as `0x${string}`,
    nonce: BigInt(wire.nonce),
    deadline: BigInt(wire.deadline),
    additionalValidationContract: wire.additionalValidationContract as `0x${string}`,
    additionalValidationData: wire.additionalValidationData as `0x${string}`,
    input: {
      token: wire.input.token as `0x${string}`,
      amount: BigInt(wire.input.amount),
    },
    outputs: wire.outputs.map((o) => ({
      token: o.token as `0x${string}`,
      amount: BigInt(o.amount),
      recipient: o.recipient as `0x${string}`,
    })),
    chainId: wire.chainId as ChainId,
    observedAt: BigInt(wire.observedAt),
    txHash: wire.txHash as `0x${string}`,
    orderHash: wire.orderHash as `0x${string}`,
    rawOrder: wire.rawOrder as `0x${string}`,
    signature: wire.signature as `0x${string}`,
  };
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
