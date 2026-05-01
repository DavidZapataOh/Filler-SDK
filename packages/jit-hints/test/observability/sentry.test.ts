import { describe, expect, test } from 'vitest';

import { initSentry, noopSentryHooks } from '../../src/observability/sentry';

describe('initSentry — env-gated no-op', () => {
  test('returns no-op when DSN is empty string', async () => {
    const hooks = await initSentry({ dsn: '' });
    expect(hooks).toBe(noopSentryHooks);
  });

  test('returns no-op when @sentry/node is not installed', async () => {
    // `@sentry/node` is intentionally not in our deps; the dynamic import
    // should fail and we fall back to no-op without throwing.
    const hooks = await initSentry({ dsn: 'https://fake.sentry.io/1' });
    expect(hooks).toBe(noopSentryHooks);
  });

  test('no-op hooks are safely callable', async () => {
    const hooks = await initSentry({ dsn: '' });
    expect(() => hooks.captureException(new Error('x'))).not.toThrow();
    expect(() => hooks.captureMessage('hello')).not.toThrow();
    await expect(hooks.shutdown()).resolves.toBeUndefined();
  });

  test('no-op captureException accepts optional context', async () => {
    const hooks = await initSentry({ dsn: '' });
    expect(() => hooks.captureException(new Error('x'), { user: 'alice' })).not.toThrow();
  });
});
