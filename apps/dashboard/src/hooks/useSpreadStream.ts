/**
 * useSpreadStream — typed wrapper for the treasury-rebalance dashboard
 * emitter's `/events` endpoint (Sprint 04 Plan 05's `dashboardEmitter.ts`).
 *
 * Server payload shape from the emitter:
 *
 *   {
 *     "txHash": "0x…",
 *     "orderHash": "0x…",
 *     "amountUSD": 250,
 *     "totalUSD": 750,        // server-cumulative — reconnect-safe (F-45)
 *     "blockNumber": "...",
 *     "timestamp": ...
 *   }
 *
 * Event name: `spread-captured`.
 *
 * Pass `emitterUrl=undefined` (e.g. when `VITE_SPREAD_EMITTER_URL` env
 * var is unset) to disable the connection — the hook reports
 * status=`idle` and the events iterable never emits. SpreadCounter
 * shows its empty state.
 */

import type { SpreadEvent } from '../components/SpreadCounter';
import { type ConnectionStatus, type UseSSEResult, useSSE } from './useSSE';

const EVENT_NAME = 'spread-captured';

/**
 * Validate + parse the SSE payload. Strict shape check so a server
 * regression doesn't silently feed bad data to the counter.
 *
 * Returns `null` on parse / shape failure → useSSE skips the event.
 */
function parseSpreadEvent(raw: string): SpreadEvent | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const obj = data as Record<string, unknown>;

  if (typeof obj.totalUSD !== 'number' || !Number.isFinite(obj.totalUSD)) return null;
  if (typeof obj.amountUSD !== 'number' || !Number.isFinite(obj.amountUSD)) return null;
  if (typeof obj.txHash !== 'string' || !obj.txHash.startsWith('0x')) return null;
  if (typeof obj.orderHash !== 'string' || !obj.orderHash.startsWith('0x')) return null;
  if (typeof obj.timestamp !== 'number') return null;

  const event: SpreadEvent = {
    totalUSD: obj.totalUSD,
    amountUSD: obj.amountUSD,
    txHash: obj.txHash as `0x${string}`,
    orderHash: obj.orderHash as `0x${string}`,
    timestamp: obj.timestamp,
  };
  // blockNumber is optional in our type; thread it through if present.
  if (typeof obj.blockNumber === 'string') {
    event.blockNumber = obj.blockNumber;
  }
  return event;
}

export interface UseSpreadStreamResult extends UseSSEResult<SpreadEvent> {
  /** Convenience alias of `status` for the LiveBadge (matches its prop type). */
  badgeStatus: 'live' | 'degraded' | 'disconnected';
}

const STATUS_TO_BADGE: Record<ConnectionStatus, 'live' | 'degraded' | 'disconnected'> = {
  idle: 'disconnected',
  connecting: 'degraded',
  live: 'live',
  reconnecting: 'degraded',
  disconnected: 'disconnected',
};

export function useSpreadStream(emitterUrl: string | undefined): UseSpreadStreamResult {
  const url = emitterUrl === undefined ? undefined : `${emitterUrl.replace(/\/$/, '')}/events`;
  const result = useSSE<SpreadEvent>(url, {
    eventName: EVENT_NAME,
    parse: parseSpreadEvent,
  });
  return { ...result, badgeStatus: STATUS_TO_BADGE[result.status] };
}
