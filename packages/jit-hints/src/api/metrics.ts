import { Counter, Gauge, Histogram, Registry } from 'prom-client';

/**
 * Prometheus metrics for the indexer's HTTP API. Each `createMetrics()` call
 * returns a fresh `Registry` so tests can assert against an isolated instance
 * without polluting the global default registry.
 *
 * In production, the top-level server creates a single registry at boot and
 * threads it through the routes via `createApp({ metrics })`.
 */

export interface JitHintsMetrics {
  registry: Registry;

  /** Total HTTP requests, labelled by route + status. */
  requestsTotal: Counter<'route' | 'status'>;

  /** Request duration histogram, labelled by route. */
  requestDurationSeconds: Histogram<'route'>;

  /** Depth-cache hits / misses. */
  depthCacheHits: Counter<'kind'>;

  /** Currently open SSE connections, labelled by endpoint. */
  sseActiveConnections: Gauge<'endpoint'>;

  /** SSE events successfully written, labelled by endpoint + type. */
  sseEventsTotal: Counter<'endpoint' | 'type'>;

  /** SSE events dropped before write, labelled by endpoint + reason. */
  sseDroppedTotal: Counter<'endpoint' | 'reason'>;

  /**
   * Reorgs observed by the indexer, labelled by chain + bucketed depth.
   * Bucket strategy: `1-3 | 4-7 | 8-12 | >12`. The `>12` bucket is
   * operationally significant because Ponder's default finality is 12
   * blocks; anything past that may indicate a malicious chain split.
   */
  reorgEventsTotal: Counter<'chainId' | 'depthBucket'>;
}

/** Default histogram buckets, in seconds. Targeted at sub-100ms expected P99. */
const DEFAULT_BUCKETS = [
  0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5,
];

export function createMetrics(): JitHintsMetrics {
  const registry = new Registry();

  const requestsTotal = new Counter({
    name: 'jit_hints_requests_total',
    help: 'Total HTTP requests handled by the indexer API.',
    labelNames: ['route', 'status'] as const,
    registers: [registry],
  });

  const requestDurationSeconds = new Histogram({
    name: 'jit_hints_request_duration_seconds',
    help: 'HTTP request duration in seconds.',
    labelNames: ['route'] as const,
    buckets: DEFAULT_BUCKETS,
    registers: [registry],
  });

  const depthCacheHits = new Counter({
    name: 'jit_hints_depth_cache_hits_total',
    help: 'Depth-hint LRU cache outcomes; `kind` is "hit" or "miss".',
    labelNames: ['kind'] as const,
    registers: [registry],
  });

  const sseActiveConnections = new Gauge({
    name: 'jit_hints_sse_active_connections',
    help: 'Open Server-Sent-Events connections.',
    labelNames: ['endpoint'] as const,
    registers: [registry],
  });

  const sseEventsTotal = new Counter({
    name: 'jit_hints_sse_events_total',
    help: 'SSE events successfully written; `type` is "snapshot" | "update" | "heartbeat".',
    labelNames: ['endpoint', 'type'] as const,
    registers: [registry],
  });

  const sseDroppedTotal = new Counter({
    name: 'jit_hints_sse_dropped_total',
    help: 'SSE events dropped before write; `reason` describes the cause.',
    labelNames: ['endpoint', 'reason'] as const,
    registers: [registry],
  });

  const reorgEventsTotal = new Counter({
    name: 'jit_hints_reorg_events_total',
    help: 'Reorgs observed by the indexer; `depthBucket` is "1-3" | "4-7" | "8-12" | ">12".',
    labelNames: ['chainId', 'depthBucket'] as const,
    registers: [registry],
  });

  return {
    registry,
    requestsTotal,
    requestDurationSeconds,
    depthCacheHits,
    sseActiveConnections,
    sseEventsTotal,
    sseDroppedTotal,
    reorgEventsTotal,
  };
}

/**
 * Reorg-depth bucket — kept here so the bridge in `reorgObserver.ts` and the
 * tests share the exact same partition. Aligned with Ponder's default
 * finality-after-12-blocks semantics.
 */
export function reorgDepthBucket(depth: number): '1-3' | '4-7' | '8-12' | '>12' {
  if (depth <= 0) return '1-3'; // defensive: treat 0/negative as smallest bucket
  if (depth <= 3) return '1-3';
  if (depth <= 7) return '4-7';
  if (depth <= 12) return '8-12';
  return '>12';
}
