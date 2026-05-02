import { describe, expect, test } from 'vitest';

import { createFiller, resolveFillerConfig } from '../src/createFiller';
import { ConfigInvalidError, FillerError } from '../src/errors';
import { silenceLoggerForTests } from '../src/logger';
import type { FillerConfig } from '../src/types';

silenceLoggerForTests();

const VALID_ACCOUNT = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' as const;
const STUB_TRANSPORT = { publicClient: {}, walletClient: {} };

const validConfig: FillerConfig = {
  chainId: 130,
  account: VALID_ACCOUNT,
  transport: STUB_TRANSPORT,
};

describe('resolveFillerConfig', () => {
  test('accepts a minimal valid config + applies indexer defaults', () => {
    const resolved = resolveFillerConfig(validConfig);
    expect(resolved.chainId).toBe(130);
    expect(resolved.account).toBe(VALID_ACCOUNT);
    expect(resolved.indexer.baseUrl).toBe('https://hints.filler.xyz');
    expect(resolved.indexer.timeoutMs).toBe(1500);
    expect(resolved.indexer.authToken).toBe('');
  });

  test('preserves user-supplied indexer overrides', () => {
    const resolved = resolveFillerConfig({
      ...validConfig,
      indexer: {
        baseUrl: 'http://localhost:42069',
        authToken: 'tok_secret',
        timeoutMs: 5000,
      },
    });
    expect(resolved.indexer.baseUrl).toBe('http://localhost:42069');
    expect(resolved.indexer.authToken).toBe('tok_secret');
    expect(resolved.indexer.timeoutMs).toBe(5000);
  });

  test('rejects unsupported chainId', () => {
    expect(() =>
      resolveFillerConfig({
        ...validConfig,
        chainId: 999_999 as never,
      }),
    ).toThrow(ConfigInvalidError);
  });

  test('rejects malformed account address', () => {
    expect(() =>
      resolveFillerConfig({
        ...validConfig,
        account: '0xnotreal' as `0x${string}`,
      }),
    ).toThrow(ConfigInvalidError);
  });

  test('rejects negative indexer timeout', () => {
    expect(() =>
      resolveFillerConfig({
        ...validConfig,
        indexer: { baseUrl: 'http://x', timeoutMs: -1 },
      }),
    ).toThrow(ConfigInvalidError);
  });

  test('attaches Zod issues to the thrown error context', () => {
    try {
      resolveFillerConfig({
        ...validConfig,
        chainId: 0 as never,
      });
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigInvalidError);
      const ctx = (err as ConfigInvalidError).context;
      expect(Array.isArray(ctx['issues'])).toBe(true);
    }
  });
});

describe('createFiller', () => {
  test('returns a typed handle with correct chainId + account + config', () => {
    const filler = createFiller(validConfig);
    expect(filler.chainId).toBe(130);
    expect(filler.account).toBe(VALID_ACCOUNT);
    expect(filler.config.indexer.baseUrl).toBe('https://hints.filler.xyz');
  });

  test('Plan-by-plan surface state — what is wired vs. what still throws', async () => {
    const filler = createFiller(validConfig);

    // Plan 02: createFiller + intents.subscribe wired; intents.list() returns []
    // when no source is configured (Plan 03 added the engine; sourced behavior
    // is covered by `intents/stream.test.ts`).
    const unsubscribe = filler.intents.subscribe({}, () => {
      // no-op handler
    });
    expect(typeof unsubscribe).toBe('function');
    unsubscribe();
    await expect(filler.intents.list()).resolves.toEqual([]);

    // Plan 04: fills.execute rejects observational intents (sentinel rawOrder)
    // with a FillerError subclass — sourced behavior covered in
    // `fills/engine.test.ts`. Expired-intent rejection is also Plan 04.
    const observational = {
      orderHash: '0xff' as `0x${string}`,
      rawOrder: '0x' as `0x${string}`,
      signature: '0x' as `0x${string}`,
      deadline: 9_999_999_999n,
    } as never;
    await expect(
      filler.fills.execute(observational, {} as never),
    ).rejects.toBeInstanceOf(FillerError);

    // Plan 06: depth + health still pending.
    await expect(filler.indexer.health()).rejects.toBeInstanceOf(FillerError);

    // Plan 07: bond reads + writes still pending.
    await expect(filler.bond.totalStake()).rejects.toBeInstanceOf(FillerError);
  });

  test('shutdown is idempotent + resolves quickly', async () => {
    const filler = createFiller(validConfig);
    await filler.shutdown();
    await filler.shutdown(); // second call is a no-op
    // If we reach here without hanging, idempotency holds.
    expect(true).toBe(true);
  });
});
