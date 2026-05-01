import { pino } from 'pino';

import { JIT_HINTS_VERSION } from './index';
import { loadEnv } from './env';

/**
 * Process-wide structured logger.
 *
 * Output format:
 *   - Production (`NODE_ENV=production`): JSON-line on stdout — ready for Loki / Datadog / any JSON collector.
 *   - Development (default): the same JSON-line plus an explicit `LOG_LEVEL` floor of `debug`.
 *
 * Hot-loop redaction: any field whose path matches the patterns below is *removed*
 * before serialization. The list captures the most common accidental leaks
 * (private keys + bearer tokens + cookies) — extend it whenever you add a new
 * secret-bearing log site.
 *
 * For pretty-printed dev logs, pipe stdout through `pino-pretty`:
 *
 *     bun run dev | pino-pretty
 *
 * We intentionally don't ship `pino-pretty` as a runtime transport — it
 * doubles the install footprint and can mask production logging issues.
 */
const REDACT_PATHS = [
  // Top-level fields — most likely to leak when callers spread an object.
  'privateKey',
  'apiKey',
  'authorization',
  'cookie',
  'sessionToken',
  'bearer',
  // Wildcard one level deep — covers `{ filler: { privateKey: ... } }` style.
  '*.privateKey',
  '*.apiKey',
  '*.authorization',
  '*.cookie',
  '*.sessionToken',
  '*.bearer',
  // HTTP headers commonly logged via `req.headers`.
  'headers.authorization',
  'headers.cookie',
  'req.headers.authorization',
  'req.headers.cookie',
];

export const logger = pino({
  level: loadEnv().LOG_LEVEL,
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    pkg: '@filler-sdk/jit-hints',
    version: JIT_HINTS_VERSION,
  },
  redact: {
    paths: REDACT_PATHS,
    remove: true,
  },
});

/**
 * Create a child logger with extra bindings (typically a request id, chainId,
 * poolId). Each child logger writes through the same transport but tags every
 * line with the bindings — useful for correlation.
 *
 * Example:
 *   const log = childLogger({ poolId, chainId });
 *   log.info({ tradeSize }, 'computing depth hint');
 */
export function childLogger(bindings: Record<string, unknown>) {
  return logger.child(bindings);
}

/**
 * Test-only: replace the active logger with a silent one so vitest output
 * doesn't drown in indexer-side log lines.
 */
export function silenceLoggerForTests(): void {
  logger.level = 'silent';
}
