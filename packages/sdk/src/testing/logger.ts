/**
 * `createTestLogger()` — capture-buffer logger for tests.
 *
 * Returns a `FillerLogger`-compatible object PLUS a `calls` array that
 * records every log call as `{level, msg, ctx}` tuples. Use in test
 * assertions when you need to verify a specific log line was emitted.
 *
 * Doesn't depend on vitest — works in any test runner. The methods are
 * plain functions, not spies. If you need spy semantics (`mockClear`,
 * `mock.calls`, etc.), use `createMockLogger` from `./mocks` instead.
 */

import type { FillerLogger } from '../types';

export interface TestLogCall {
  level: 'trace' | 'debug' | 'info' | 'warn' | 'error';
  msg: string | undefined;
  ctx: unknown;
}

export interface TestLogger extends FillerLogger {
  /** All captured log entries, in arrival order. */
  readonly calls: readonly TestLogCall[];
  /** Convenience: filter calls by level. */
  callsAt(level: TestLogCall['level']): readonly TestLogCall[];
  /** Reset the buffer. */
  reset(): void;
}

export function createTestLogger(): TestLogger {
  const buffer: TestLogCall[] = [];
  const push =
    (level: TestLogCall['level']) =>
    (ctx: unknown, msg?: string): void => {
      buffer.push({ level, msg, ctx });
    };
  const logger: TestLogger = {
    trace: push('trace'),
    debug: push('debug'),
    info: push('info'),
    warn: push('warn'),
    error: push('error'),
    get calls(): readonly TestLogCall[] {
      return buffer;
    },
    callsAt(level) {
      return buffer.filter((c) => c.level === level);
    },
    reset() {
      buffer.length = 0;
    },
    child: makeChild,
  };
  function makeChild(bindings: Record<string, unknown>): FillerLogger {
    const childPush =
      (level: TestLogCall['level']) =>
      (ctx: unknown, msg?: string): void => {
        const merged =
          ctx !== null && typeof ctx === 'object'
            ? { ...bindings, ...(ctx as Record<string, unknown>) }
            : { ...bindings, value: ctx };
        buffer.push({ level, msg, ctx: merged });
      };
    return {
      trace: childPush('trace'),
      debug: childPush('debug'),
      info: childPush('info'),
      warn: childPush('warn'),
      error: childPush('error'),
      child: makeChild,
    };
  }
  return logger;
}
