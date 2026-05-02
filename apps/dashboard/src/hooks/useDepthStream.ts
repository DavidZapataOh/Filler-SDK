/**
 * useDepthStream — typed wrapper for the indexer's depth SSE endpoint.
 *
 * URL shape (Sprint 02 jit-hints indexer):
 *
 *   GET /depth/stream?pool=0x…&size=…&zeroForOne=true
 *
 * Event name: `depth`.
 *
 * Server payload shape:
 *
 *   {
 *     "ticks": [{ "tick": number, "liquidity": number }, ...],
 *     "currentTick": number,
 *     "jitRange": { "tickLower": number, "tickUpper": number } | undefined
 *   }
 *
 * Pass `indexerUrl=undefined` to disable the connection (empty mode).
 * The DepthSnapshot shape is the same one `<JITDepthChart>` consumes.
 *
 * URL is memoised on params so the consumer can pass an inline `params`
 * object without forcing a reconnect on every render.
 */

import { useMemo } from 'react';

import type { DepthSnapshot } from '../components/JITDepthChart';
import { type UseSSEResult, useSSE } from './useSSE';

const EVENT_NAME = 'depth';

export interface DepthStreamParams {
  /** Pool address — typically `0x…` (40 hex). */
  pool: string;
  /** Trade size as a bigint. Streamed to the indexer for delta-aware filtering. */
  size: bigint;
  /** Direction of the trade. */
  zeroForOne: boolean;
}

/** Validate the depth snapshot shape strictly so bad server data doesn't poison the chart. */
function parseDepthSnapshot(raw: string): DepthSnapshot | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const obj = data as Record<string, unknown>;

  if (!Array.isArray(obj.ticks)) return null;
  if (typeof obj.currentTick !== 'number' || !Number.isFinite(obj.currentTick)) return null;

  const ticks: { tick: number; liquidity: number }[] = [];
  for (const t of obj.ticks) {
    if (typeof t !== 'object' || t === null) return null;
    const tt = t as Record<string, unknown>;
    if (typeof tt.tick !== 'number' || typeof tt.liquidity !== 'number') return null;
    ticks.push({ tick: tt.tick, liquidity: tt.liquidity });
  }

  const snapshot: DepthSnapshot = {
    ticks,
    currentTick: obj.currentTick,
  };

  const jit = obj.jitRange;
  if (jit !== undefined && jit !== null && typeof jit === 'object') {
    const jr = jit as Record<string, unknown>;
    if (typeof jr.tickLower === 'number' && typeof jr.tickUpper === 'number') {
      snapshot.jitRange = { tickLower: jr.tickLower, tickUpper: jr.tickUpper };
    }
  }

  return snapshot;
}

export function useDepthStream(
  indexerUrl: string | undefined,
  params: DepthStreamParams,
): UseSSEResult<DepthSnapshot> {
  // Memoise the URL so an inline `params={{...}}` from the caller doesn't
  // force a reconnect on every render. Stringified params are the cache key.
  const url = useMemo(() => {
    if (indexerUrl === undefined) return undefined;
    const qs = new URLSearchParams({
      pool: params.pool,
      size: params.size.toString(),
      zeroForOne: String(params.zeroForOne),
    });
    return `${indexerUrl.replace(/\/$/, '')}/depth/stream?${qs.toString()}`;
  }, [indexerUrl, params.pool, params.size, params.zeroForOne]);

  return useSSE<DepthSnapshot>(url, {
    eventName: EVENT_NAME,
    parse: parseDepthSnapshot,
  });
}
