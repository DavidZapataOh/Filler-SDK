import { pino } from 'pino';

import { loadEnv } from './env';

/**
 * Process-wide logger. Reads `LOG_LEVEL` from the validated env (defaults to
 * `info`). Production deployments should set `LOG_LEVEL=info` (or `warn`); local
 * dev can drop to `debug` / `trace`.
 *
 * pino's structured-logging output integrates cleanly with Loki / Datadog / any
 * JSON-line collector. For human-readable local logs, pipe through `pino-pretty`:
 *
 *   bun run dev | pino-pretty
 */
export const logger = pino({
  level: loadEnv().LOG_LEVEL,
  base: {
    pkg: '@filler-sdk/jit-hints',
  },
});

/**
 * Test-only: replace the active logger with a silent one so vitest output
 * doesn't drown in indexer-side log lines.
 */
export function silenceLoggerForTests(): void {
  logger.level = 'silent';
}
