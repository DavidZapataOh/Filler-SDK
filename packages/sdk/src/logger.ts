/**
 * Default logger for `@filler-sdk/sdk`.
 *
 * The SDK accepts ANY logger that implements the `FillerLogger` interface
 * (see `types.ts`) — solver authors keep their existing logging stack. This
 * module exists for two cases:
 *
 *   1. The user didn't pass `config.logger` to `createFiller` — we fall back
 *      to a sane Pino instance with redaction + JSON output + ISO timestamps.
 *   2. Tests need a silenced logger — `silenceLoggerForTests()` pins level to
 *      `silent` so vitest output isn't drowned in info lines.
 *
 * We pull pino directly. It's already a workspace dep (jit-hints uses it) and
 * the install footprint (~50 KB minified) is acceptable for a logger that
 * downstream consumers may not even use (they bring their own).
 */

import { type Logger as PinoLogger, pino } from 'pino';

import type { FillerLogger } from './types';

const REDACT_PATHS = [
  'privateKey',
  'apiKey',
  'authorization',
  'cookie',
  'sessionToken',
  'bearer',
  '*.privateKey',
  '*.apiKey',
  '*.authorization',
  'headers.authorization',
  'headers.cookie',
];

/**
 * Build a fresh Pino logger with the SDK's defaults. Users can either:
 *   - pass their own `FillerLogger` to `createFiller` (preferred), or
 *   - call this and pass the result, optionally with a `level` override.
 */
export function createDefaultLogger(
  opts: { level?: PinoLogger['level']; bindings?: Record<string, unknown> } = {},
): PinoLogger {
  return pino({
    level: opts.level ?? process.env['FILLER_LOG_LEVEL'] ?? 'info',
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]', remove: false },
    timestamp: pino.stdTimeFunctions.isoTime,
    base: {
      pkg: '@filler-sdk/sdk',
      ...opts.bindings,
    },
  });
}

/**
 * Module-level default logger. The SDK uses this when the user didn't supply
 * one. We expose `silenceLoggerForTests` to flip its level for vitest.
 */
export const logger: PinoLogger = createDefaultLogger();

/** Adapt any `FillerLogger` into a child logger with extra bindings. */
export function childLogger(
  parent: FillerLogger,
  bindings: Record<string, unknown>,
): FillerLogger {
  if (typeof parent.child === 'function') {
    return parent.child(bindings);
  }
  // Fallback for loggers without `.child()`: wrap call sites + prepend
  // bindings to the first arg. Slight performance cost for non-Pino loggers
  // but preserves the FillerLogger contract.
  return {
    trace: (obj, msg) => parent.trace(mergeBindings(obj, bindings), msg),
    debug: (obj, msg) => parent.debug(mergeBindings(obj, bindings), msg),
    info: (obj, msg) => parent.info(mergeBindings(obj, bindings), msg),
    warn: (obj, msg) => parent.warn(mergeBindings(obj, bindings), msg),
    error: (obj, msg) => parent.error(mergeBindings(obj, bindings), msg),
  };
}

function mergeBindings(
  obj: unknown,
  bindings: Record<string, unknown>,
): Record<string, unknown> {
  if (obj !== null && typeof obj === 'object') {
    return { ...bindings, ...(obj as Record<string, unknown>) };
  }
  return { ...bindings, value: obj };
}

/**
 * Test-only: silence the module-level default logger. Has no effect on
 * user-supplied loggers (those are theirs to silence).
 */
export function silenceLoggerForTests(): void {
  logger.level = 'silent';
}
