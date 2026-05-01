import type { PoolEvents, TypedEventBus } from '../events/bus';
import type { JitHintsMetrics } from './metrics';

/**
 * Bridge that listens for `pool:*` lifecycle events on the typed bus and bumps
 * the `eventsProcessed` Prometheus counter, labelled by chain × event type.
 *
 * Why a dedicated bridge instead of inlining metric.inc(...) in the handlers:
 *   - Handlers run in Ponder's runtime, which doesn't share an instance with
 *     `createApp`'s metrics registry. The bus is the natural seam.
 *   - The reorg counter follows the same pattern (`reorgObserver.ts`) — keeping
 *     all bus-→-metric bridges in one shape simplifies review.
 *   - Tests can wire up the bridge against a fresh registry + verify
 *     accounting without booting Ponder.
 *
 * The label `eventType` mirrors v4-core's contract event names (`Initialize`,
 * `ModifyLiquidity`, `Swap`, `Donate`) so dashboards correlate to on-chain
 * traces directly.
 */
export interface EventsObserver {
  dispose(): void;
}

const CHANNEL_TO_EVENT_TYPE: Record<keyof PoolEvents, string | null> = {
  'pool:initialized': 'Initialize',
  'pool:liquidity-changed': 'ModifyLiquidity',
  'pool:swap': 'Swap',
  'pool:donate': 'Donate',
  'pool:reorg': null, // counted separately via `reorgObserver`
};

export function createEventsObserver(
  bus: TypedEventBus<PoolEvents>,
  metrics: JitHintsMetrics,
): EventsObserver {
  const handlers: Array<{ name: keyof PoolEvents; fn: (data: { chainId: number }) => void }> = [];

  for (const [channel, eventType] of Object.entries(CHANNEL_TO_EVENT_TYPE) as [
    keyof PoolEvents,
    string | null,
  ][]) {
    if (eventType === null) continue;
    const fn = (data: { chainId: number }) => {
      metrics.eventsProcessed.inc({
        chainId: String(data.chainId),
        eventType,
      });
    };
    bus.on(channel, fn as Parameters<typeof bus.on>[1]);
    handlers.push({ name: channel, fn });
  }

  return {
    dispose() {
      for (const h of handlers) {
        bus.off(h.name, h.fn as Parameters<typeof bus.off>[1]);
      }
    },
  };
}
