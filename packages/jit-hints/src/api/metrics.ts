import { Counter, Histogram, Registry } from 'prom-client';

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

  return {
    registry,
    requestsTotal,
    requestDurationSeconds,
    depthCacheHits,
  };
}
