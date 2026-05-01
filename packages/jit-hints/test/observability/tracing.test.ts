import { describe, expect, test } from 'vitest';

import { initTracing, noopTracingHooks } from '../../src/observability/tracing';

describe('initTracing — env-gated no-op', () => {
  test('returns no-op when endpoint is empty', async () => {
    const hooks = await initTracing({ endpoint: '' });
    expect(hooks).toBe(noopTracingHooks);
  });

  test('returns no-op when OTEL packages are not installed', async () => {
    // OTEL packages are intentionally not in our deps; falls back to no-op.
    const hooks = await initTracing({
      endpoint: 'https://otlp.example.com:4318',
    });
    expect(hooks).toBe(noopTracingHooks);
  });

  test('no-op shutdown is safely callable', async () => {
    const hooks = await initTracing({ endpoint: '' });
    await expect(hooks.shutdown()).resolves.toBeUndefined();
  });
});
