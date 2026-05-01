import { afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest';

import { _resetEnvForTesting } from '../src/env';
import { silenceLoggerForTests } from '../src/logger';
import { boot } from '../src/server';

/**
 * Smoke test for the docker entrypoint. Verifies:
 *   - `boot()` loads cleanly without `DATABASE_URL` (mock DB fallback path)
 *   - The HTTP server actually binds to a port + answers `/health`
 *   - `shutdown()` returns within the deadline (graceful path closes fast
 *     when there are no in-flight connections)
 *   - `shutdown()` is idempotent — second call is a no-op
 *
 * Importing `../src/server` exercises the entrypoint guard: it must NOT call
 * `boot()` on import (otherwise this test would race two boots). The guard
 * compares `import.meta.url` against `process.argv[1]`, so unless the test
 * runner invokes the file directly, only the named exports are exercised.
 */

const ORIGINAL_ENV = { ...process.env };

function pickPort(): number {
  // Pick a high ephemeral port, well clear of the default 42069.
  return 50_000 + Math.floor(Math.random() * 10_000);
}

describe('server boot', () => {
  beforeAll(() => {
    silenceLoggerForTests();
  });

  beforeEach(() => {
    _resetEnvForTesting();
    for (const key of Object.keys(process.env)) {
      if (
        key.endsWith('_RPC_URL') ||
        key.endsWith('_WSS_URL') ||
        key.endsWith('_POOL_MANAGER') ||
        key.endsWith('_START_BLOCK')
      ) {
        delete process.env[key];
      }
    }
    delete process.env['DATABASE_URL'];
    delete process.env['SENTRY_DSN'];
    delete process.env['OTEL_EXPORTER_OTLP_ENDPOINT'];
    delete process.env['LOG_LEVEL'];
    delete process.env['HOST'];
    delete process.env['PORT'];
  });

  afterEach(() => {
    _resetEnvForTesting();
    for (const k of Object.keys(process.env)) delete process.env[k];
    Object.assign(process.env, ORIGINAL_ENV);
  });

  test('boot() returns a shutdown handle that closes cleanly', async () => {
    process.env['HOST'] = '127.0.0.1';
    process.env['PORT'] = String(pickPort());

    const { shutdown } = await boot();
    expect(typeof shutdown).toBe('function');

    // Hitting /health proves the server actually bound + the mock DB path is
    // wired correctly. Running locally we'd `fetch()` it, but vitest can race
    // with port binding on slow CI; we just exercise the shutdown path.
    await shutdown('TEST');
  }, 15_000);

  test('boot() then shutdown() is idempotent (second call is a no-op)', async () => {
    process.env['HOST'] = '127.0.0.1';
    process.env['PORT'] = String(pickPort());

    const { shutdown } = await boot();
    await shutdown('FIRST');
    // Second call must not throw or hang past the timeout.
    await shutdown('SECOND');
  }, 15_000);

  test('boot() responds 200 on /health via real HTTP fetch', async () => {
    process.env['HOST'] = '127.0.0.1';
    const port = pickPort();
    process.env['PORT'] = String(port);

    const { shutdown } = await boot();
    try {
      // Give the server a tick to register the listener; node-server resolves
      // synchronously after `serve()` but the OS-level bind can lag a hair.
      await new Promise((r) => setTimeout(r, 50));
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body['status']).toBe('ok');
    } finally {
      await shutdown('TEST');
    }
  }, 15_000);
});
