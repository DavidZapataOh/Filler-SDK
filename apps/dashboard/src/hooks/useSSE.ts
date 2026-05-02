/**
 * useSSE — subscribe to a Server-Sent Events stream + expose it as an
 * `AsyncIterable<T>` plus a `ConnectionStatus` for UI badges.
 *
 * Why an AsyncIterable: <SpreadCounter> + <JITDepthChart> consume their
 * sources via `for await` (Plan 03 / 04). Pushing this contract through
 * the hook means components stay transport-agnostic — replay-mode (Plan
 * 07) can swap the SSE iterable for a deterministic finite generator
 * with zero component changes.
 *
 * Critical fix vs the plan markdown's sketch — STABLE iterable identity:
 *
 *   The plan returns a fresh `{ [Symbol.asyncIterator]() {...} }` literal
 *   on every render. Components that pass that into another component's
 *   `useEffect [source]` would re-fire the effect on every render →
 *   reconnect / unsubscribe loop. We pin the iterable via `useMemo([])`
 *   that delegates to refs the effect populates. One reference for the
 *   lifetime of the hook → consumer effects only re-fire when the URL /
 *   eventName actually changes. (Logged as F-51.)
 *
 * Reconnect strategy:
 *
 *   Native EventSource auto-reconnects, but the demo wants explicit
 *   control over the reconnect cadence + a "reconnecting" UI state.
 *   We catch `error` events, mark status=`reconnecting`, schedule a
 *   reconnect via `setTimeout(connect, backoff(attempt))`, and reset
 *   the attempt counter on the next successful message.
 *
 *   Backoff: exponential with ±25% jitter, capped at 30 s.
 *
 * Bounded queue:
 *
 *   If the consumer is slow, queued events would grow without bound.
 *   We cap at `MAX_BUFFERED` (default 500) and DROP THE OLDEST when full.
 *   For dashboards showing recent state, this is the right semantic
 *   (lossy on overflow, never blocks the producer).
 */

import { useEffect, useMemo, useRef, useState } from 'react';

export type ConnectionStatus = 'idle' | 'connecting' | 'live' | 'reconnecting' | 'disconnected';

export interface UseSSEOptions<T> {
  /** Event name to listen for. Default `'message'` (the SSE default). */
  eventName?: string;
  /**
   * Parse + validate the raw event payload. Return `null` to skip the
   * event (e.g. validation failed). Default: `JSON.parse` then assume
   * the shape — fine for trusted same-origin streams.
   */
  parse?: (raw: string) => T | null;
  /** Cap the in-flight buffer. Defaults to 500. */
  maxBuffered?: number;
  /** Reconnect base delay, ms. Default 500. */
  reconnectBaseMs?: number;
  /** Reconnect cap, ms. Default 30000. */
  reconnectCapMs?: number;
  /**
   * Maximum reconnect attempts before giving up (status=`disconnected`).
   * Default 10. Pass `Infinity` to keep retrying forever.
   */
  maxReconnectAttempts?: number;
}

export interface UseSSEResult<T> {
  /** Stable AsyncIterable across renders — safe to pass into `<X source={events}>`. */
  events: AsyncIterable<T>;
  /** Connection lifecycle for UI badges. */
  status: ConnectionStatus;
  /** Latest reconnect attempt count. Resets on success. */
  reconnectAttempt: number;
}

const DEFAULTS = {
  maxBuffered: 500,
  reconnectBaseMs: 500,
  reconnectCapMs: 30_000,
  maxReconnectAttempts: 10,
} as const;

/**
 * Compute backoff with ±25% jitter. Min 100ms so we don't spin under
 * pathological clock skew.
 */
function backoffMs(attempt: number, baseMs: number, capMs: number): number {
  const exp = Math.min(capMs, baseMs * 2 ** attempt);
  const jitter = exp * 0.25 * (Math.random() * 2 - 1);
  return Math.max(100, Math.floor(exp + jitter));
}

const defaultParse = <T>(raw: string): T | null => {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

export function useSSE<T>(
  url: string | undefined,
  options: UseSSEOptions<T> = {},
): UseSSEResult<T> {
  const eventName = options.eventName ?? 'message';
  const maxBuffered = options.maxBuffered ?? DEFAULTS.maxBuffered;
  const reconnectBaseMs = options.reconnectBaseMs ?? DEFAULTS.reconnectBaseMs;
  const reconnectCapMs = options.reconnectCapMs ?? DEFAULTS.reconnectCapMs;
  const maxReconnectAttempts = options.maxReconnectAttempts ?? DEFAULTS.maxReconnectAttempts;

  // Refs persist across renders + the effect populates them. The exposed
  // iterable reads from these — so the iterable identity stays stable
  // (useMemo([]) below) while the data behind it is always current.
  const queueRef = useRef<T[]>([]);
  const resolversRef = useRef<((r: IteratorResult<T>) => void)[]>([]);
  const closedRef = useRef(false);

  // The `parse` callback is typically an inline function from the caller —
  // a fresh closure each render. Holding it in a ref lets the effect read
  // the LATEST parser without re-firing on identity change. Without this,
  // every render would reset the EventSource → reconnect spam.
  const parseRef = useRef<(raw: string) => T | null>(options.parse ?? defaultParse);
  parseRef.current = options.parse ?? defaultParse;

  const [status, setStatus] = useState<ConnectionStatus>(url === undefined ? 'idle' : 'connecting');
  const [reconnectAttempt, setReconnectAttempt] = useState(0);

  useEffect(() => {
    // Reset on URL change.
    closedRef.current = false;

    if (url === undefined) {
      setStatus('idle');
      return undefined;
    }

    // EventSource is browser-only. In Node-side rendering / tests without
    // a stub it's undefined — bail to disconnected so the UI shows the
    // right state instead of crashing.
    if (typeof EventSource === 'undefined') {
      setStatus('disconnected');
      return undefined;
    }

    setStatus('connecting');

    let attempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let es: EventSource | null = null;
    let unmounted = false;

    function pushEvent(raw: string): void {
      const parsed = parseRef.current(raw);
      if (parsed === null) return;
      const resolvers = resolversRef.current;
      if (resolvers.length > 0) {
        const resolve = resolvers.shift();
        // shift() returns undefined only if the array is empty — guarded above.
        if (resolve !== undefined) {
          resolve({ value: parsed, done: false });
        }
        return;
      }
      const queue = queueRef.current;
      queue.push(parsed);
      // Cap: drop the OLDEST if we've blown the budget. Lossy-on-overflow,
      // appropriate for dashboards showing recent state.
      while (queue.length > maxBuffered) {
        queue.shift();
      }
    }

    function connect(): void {
      if (unmounted) return;
      try {
        es = new EventSource(url ?? '');
      } catch {
        setStatus('disconnected');
        return;
      }

      es.addEventListener('open', () => {
        if (unmounted) return;
        attempt = 0;
        setReconnectAttempt(0);
        setStatus('live');
      });

      es.addEventListener(eventName, (e) => {
        if (unmounted) return;
        // EventSource passes a MessageEvent for typed events. The event
        // payload comes through as `.data`.
        const me = e as MessageEvent<string>;
        // Mark live on first message even if 'open' didn't fire (some
        // servers send data before the open handshake completes).
        setStatus('live');
        attempt = 0;
        setReconnectAttempt(0);
        pushEvent(me.data);
      });

      es.addEventListener('error', () => {
        if (unmounted) return;
        if (es !== null) {
          es.close();
          es = null;
        }
        if (attempt >= maxReconnectAttempts) {
          setStatus('disconnected');
          return;
        }
        const delay = backoffMs(attempt, reconnectBaseMs, reconnectCapMs);
        attempt += 1;
        setReconnectAttempt(attempt);
        setStatus('reconnecting');
        reconnectTimer = setTimeout(connect, delay);
      });
    }

    connect();

    return () => {
      unmounted = true;
      closedRef.current = true;
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (es !== null) {
        es.close();
        es = null;
      }
      // Resolve any pending iterators so consumers can exit their for-await.
      const resolvers = resolversRef.current;
      while (resolvers.length > 0) {
        const resolve = resolvers.shift();
        if (resolve !== undefined) {
          resolve({ value: undefined as never, done: true });
        }
      }
      // Drop any queued events too — they're stale on URL change / unmount.
      queueRef.current.length = 0;
      setStatus('disconnected');
    };
    // Deps: only the URL + event name + numeric tunings. `parse` lives in a
    // ref so a fresh closure per render doesn't re-fire the effect — that
    // would tear down + rebuild the EventSource on every component render.
  }, [url, eventName, maxBuffered, reconnectBaseMs, reconnectCapMs, maxReconnectAttempts]);

  // STABLE iterable across renders — empty deps + delegate to refs.
  const events = useMemo<AsyncIterable<T>>(
    () => ({
      [Symbol.asyncIterator]() {
        return {
          next(): Promise<IteratorResult<T>> {
            if (closedRef.current) {
              return Promise.resolve({ value: undefined as never, done: true });
            }
            const queue = queueRef.current;
            if (queue.length > 0) {
              const value = queue.shift();
              // Defensive: shift() can return undefined if queue is empty
              // (race with another iterator), even though we just checked.
              if (value !== undefined) {
                return Promise.resolve({ value, done: false });
              }
            }
            return new Promise((resolve) => {
              resolversRef.current.push(resolve);
            });
          },
        };
      },
    }),
    [],
  );

  return { events, status, reconnectAttempt };
}
