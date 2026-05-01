import type { PoolEvents, TypedEventBus } from '../events/bus';
import { type JitHintsMetrics, reorgDepthBucket } from './metrics';

/**
 * Bridge that listens for `pool:reorg` on the typed bus and updates the
 * `reorgEventsTotal` Prometheus counter. Returns a `dispose()` to unsubscribe
 * — useful for tests and graceful shutdown.
 *
 * Why a separate file: the SSE handler subscribes to `pool:reorg` to refresh
 * connected clients; the metrics observer needs the same event for telemetry.
 * Keeping the metric bridge orthogonal means we don't tangle "telemetry on
 * reorg" with "reorg-aware SSE handler" — both can live independently.
 */
export interface ReorgObserver {
  dispose(): void;
}

export function createReorgObserver(
  bus: TypedEventBus<PoolEvents>,
  metrics: JitHintsMetrics,
): ReorgObserver {
  const onReorg = (data: PoolEvents['pool:reorg']) => {
    metrics.reorgEventsTotal.inc({
      chainId: String(data.chainId),
      depthBucket: reorgDepthBucket(data.depth),
    });
  };

  bus.on('pool:reorg', onReorg);

  return {
    dispose() {
      bus.off('pool:reorg', onReorg);
    },
  };
}
