import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';

import { calculateDepthHint } from '../../depth/calculator';
import type { PoolEvents, TypedEventBus } from '../../events/bus';
import type { JitHintsDb } from '../db';
import type { JitHintsMetrics } from '../metrics';
import { DepthQuerySchema } from '../schemas';
import { serializeDepthHint } from '../serializers';

export interface DepthStreamRouteDeps {
  db: JitHintsDb;
  eventBus: TypedEventBus<PoolEvents>;
  metrics: JitHintsMetrics;
  /** Maximum concurrent SSE clients. New clients past this get 503. */
  maxConnections?: number;
  /** Heartbeat interval in milliseconds. */
  heartbeatMs?: number;
  /** Per-client throttle window — at most one update emitted per window. */
  throttleMs?: number;
  /** Test-only injectable clock; defaults to `Date.now`. */
  now?: () => number;
}

const DEFAULT_MAX_CONNECTIONS = 1_000;
const DEFAULT_HEARTBEAT_MS = 15_000;
const DEFAULT_THROTTLE_MS = 100;
const ENDPOINT_LABEL = 'depth_stream';

/**
 * GET /depth/stream — Server-Sent-Events feed of `DepthHint` updates.
 *
 * Lifecycle:
 *   1. Client opens the stream with the same query params as `/depth`.
 *   2. Server validates + capacity-checks. Over capacity → 503.
 *   3. Server emits a `depth` event with the current snapshot.
 *      If the pool is unknown → emits `error` event then closes.
 *   4. Server subscribes to `pool:swap` + `pool:liquidity-changed` on the bus.
 *      For each matching event, recompute and emit `depth` (throttled).
 *   5. Heartbeats emit every `heartbeatMs` so dead connections are spotted.
 *   6. Client disconnect → unsubscribe + clear interval + decrement gauge.
 *
 * Backpressure: writes are awaited, so a slow client provides natural
 * backpressure on the pool-event listener path. The throttle bounds the
 * burst rate to the operator-configured ceiling regardless of client speed.
 */
export function createDepthStreamRoute(deps: DepthStreamRouteDeps): Hono {
  const app = new Hono();
  const maxConnections = deps.maxConnections ?? DEFAULT_MAX_CONNECTIONS;
  const heartbeatMs = deps.heartbeatMs ?? DEFAULT_HEARTBEAT_MS;
  const throttleMs = deps.throttleMs ?? DEFAULT_THROTTLE_MS;
  const now = deps.now ?? (() => Date.now());

  // Process-wide counter so capacity is enforced across all clients of a single
  // server instance, not per-route-invocation.
  let activeConnections = 0;

  app.get('/depth/stream', (c) => {
    const parsed = DepthQuerySchema.safeParse(c.req.query());
    if (!parsed.success) {
      return c.json(
        { error: 'Invalid query parameters', issues: parsed.error.issues },
        400,
      );
    }

    if (activeConnections >= maxConnections) {
      deps.metrics.sseDroppedTotal.inc({ endpoint: ENDPOINT_LABEL, reason: 'capacity' });
      return c.json(
        { error: 'Server at SSE capacity', retryAfterSec: 30 },
        503,
        { 'Retry-After': '30' },
      );
    }

    const { pool, size, zeroForOne, slippageBps, gasPriceWei, gasOverhead } =
      parsed.data;
    const poolId = pool as `0x${string}`;

    return streamSSE(c, async (stream) => {
      activeConnections += 1;
      deps.metrics.sseActiveConnections.inc({ endpoint: ENDPOINT_LABEL });

      let lastEmit = 0;
      let aborted = false;
      let snapshotDone = false;
      stream.onAbort(() => {
        aborted = true;
      });

      // Build the hint payload from current pool state. Returns `null` for an
      // unknown pool so the caller can decide whether to emit `error` and close.
      const computeAndSerialize = async () => {
        const poolRow = await deps.db.findPool(poolId);
        if (poolRow === null) return null;
        const ticks = await deps.db.findTicksForPool(poolId);
        const hint = calculateDepthHint(poolRow, ticks, {
          poolId,
          tradeSize: BigInt(size),
          zeroForOne,
          slippageBps,
          ...(gasPriceWei !== undefined ? { gasPriceWei: BigInt(gasPriceWei) } : {}),
          ...(gasOverhead !== undefined ? { gasOverhead: BigInt(gasOverhead) } : {}),
        });
        return serializeDepthHint(pool, hint);
      };

      const onPoolEvent = async (data: { poolId: `0x${string}` }) => {
        if (aborted || !snapshotDone || data.poolId !== poolId) return;

        // Throttle: drop events that arrive faster than `throttleMs`.
        const t = now();
        if (t - lastEmit < throttleMs) {
          deps.metrics.sseDroppedTotal.inc({
            endpoint: ENDPOINT_LABEL,
            reason: 'throttle',
          });
          return;
        }
        lastEmit = t;

        try {
          const updated = await computeAndSerialize();
          if (updated === null) return;
          await stream.writeSSE({
            event: 'depth',
            data: JSON.stringify(updated),
          });
          deps.metrics.sseEventsTotal.inc({ endpoint: ENDPOINT_LABEL, type: 'update' });
        } catch {
          deps.metrics.sseDroppedTotal.inc({
            endpoint: ENDPOINT_LABEL,
            reason: 'update_failed',
          });
        }
      };

      /**
       * Reorg refresh handler. A reorg invalidates everything we've shown the
       * client; we recompute + emit IMMEDIATELY (bypassing the throttle) so the
       * post-reorg corrected state reaches the client without waiting for the
       * next swap. Filters by chainId so a reorg on a different chain doesn't
       * trigger a no-op recompute.
       */
      const onReorgEvent = async (data: { chainId: number }) => {
        if (aborted || !snapshotDone) return;
        try {
          const updated = await computeAndSerialize();
          if (updated === null) return;
          // The pool itself confirms which chain it's on; if the reorg was on a
          // different chain, our recompute returns the same payload — harmless
          // but skippable. We use the pool's chainId to gate the write.
          const poolRow = await deps.db.findPool(poolId);
          if (poolRow === null || poolRow.chainId !== data.chainId) return;
          await stream.writeSSE({
            event: 'depth',
            data: JSON.stringify(updated),
          });
          lastEmit = now();
          deps.metrics.sseEventsTotal.inc({
            endpoint: ENDPOINT_LABEL,
            type: 'reorg-refresh',
          });
        } catch {
          deps.metrics.sseDroppedTotal.inc({
            endpoint: ENDPOINT_LABEL,
            reason: 'update_failed',
          });
        }
      };

      // Subscribe to pool events FIRST so events fired between the snapshot
      // computation and listener wire-up aren't lost. The `snapshotDone` flag
      // guards `onPoolEvent` from racing with the in-flight snapshot writeSSE
      // — pre-snapshot events are dropped (the snapshot itself reflects
      // current state, and any subsequent event will trigger a fresh update).
      deps.eventBus.on('pool:swap', onPoolEvent);
      deps.eventBus.on('pool:liquidity-changed', onPoolEvent);
      deps.eventBus.on('pool:reorg', onReorgEvent);

      // Initial snapshot. If the pool isn't indexed, surface that to the client
      // and bail before doing anything else.
      try {
        const snapshot = await computeAndSerialize();
        if (snapshot === null) {
          await stream.writeSSE({
            event: 'error',
            data: JSON.stringify({ error: 'Pool not indexed', poolId }),
          });
          deps.eventBus.off('pool:swap', onPoolEvent);
          deps.eventBus.off('pool:liquidity-changed', onPoolEvent);
          deps.eventBus.off('pool:reorg', onReorgEvent);
          deps.metrics.sseActiveConnections.dec({ endpoint: ENDPOINT_LABEL });
          activeConnections -= 1;
          return;
        }
        await stream.writeSSE({
          event: 'depth',
          data: JSON.stringify(snapshot),
        });
        deps.metrics.sseEventsTotal.inc({ endpoint: ENDPOINT_LABEL, type: 'snapshot' });
        lastEmit = now();
        snapshotDone = true;
      } catch {
        deps.metrics.sseDroppedTotal.inc({
          endpoint: ENDPOINT_LABEL,
          reason: 'snapshot_failed',
        });
        deps.eventBus.off('pool:swap', onPoolEvent);
        deps.eventBus.off('pool:liquidity-changed', onPoolEvent);
        deps.eventBus.off('pool:reorg', onReorgEvent);
        deps.metrics.sseActiveConnections.dec({ endpoint: ENDPOINT_LABEL });
        activeConnections -= 1;
        return;
      }

      // Heartbeat. setInterval is unref'd so it doesn't block process exit.
      const heartbeat = setInterval(async () => {
        if (aborted) return;
        try {
          await stream.writeSSE({
            event: 'heartbeat',
            data: JSON.stringify({ ts: now() }),
          });
          deps.metrics.sseEventsTotal.inc({
            endpoint: ENDPOINT_LABEL,
            type: 'heartbeat',
          });
        } catch {
          // Stream is dead — let the abort handler clean up.
        }
      }, heartbeatMs);
      heartbeat.unref?.();

      // Wait for the stream to be aborted, then clean up. The handler must NOT
      // return early — Hono closes the response as soon as the callback exits.
      await new Promise<void>((resolve) => {
        if (aborted) {
          resolve();
          return;
        }
        stream.onAbort(() => resolve());
      });

      clearInterval(heartbeat);
      deps.eventBus.off('pool:swap', onPoolEvent);
      deps.eventBus.off('pool:liquidity-changed', onPoolEvent);
      deps.eventBus.off('pool:reorg', onReorgEvent);
      deps.metrics.sseActiveConnections.dec({ endpoint: ENDPOINT_LABEL });
      activeConnections -= 1;
    });
  });

  return app;
}
