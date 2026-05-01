import { describe, expect, test } from 'vitest';

import { silenceLoggerForTests } from '../../src';
import { createPollingIntentSource } from '../../src/intents/pollingSource';
import { logger } from '../../src/logger';
import { TOKENS } from './fixtures';

silenceLoggerForTests();

const REACTOR = '0x1111111111111111111111111111111111111111' as const;
const SWAPPER = '0x2222222222222222222222222222222222222222' as const;

function intentWire(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    reactor: REACTOR,
    swapper: SWAPPER,
    nonce: '1',
    deadline: '9999999999',
    additionalValidationContract: '0x0000000000000000000000000000000000000000',
    additionalValidationData: '0x',
    input: { token: TOKENS.USDC, amount: '1000000000' },
    outputs: [{ token: TOKENS.WETH, amount: '500000000000000000', recipient: SWAPPER }],
    chainId: 130,
    observedAt: '100',
    txHash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    orderHash: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    rawOrder: '0xdeadbeef',
    signature: '0xcafebabe',
    ...overrides,
  };
}

describe('createPollingIntentSource', () => {
  test('label includes the base URL', () => {
    const source = createPollingIntentSource({
      baseUrl: 'https://api.example.com',
      logger,
      fetch: (async () => new Response('{}')) as typeof fetch,
    });
    expect(source.label).toBe('polling:https://api.example.com');
  });

  test('strips trailing slash from baseUrl', () => {
    const source = createPollingIntentSource({
      baseUrl: 'https://api.example.com////',
      logger,
      fetch: (async () => new Response('{}')) as typeof fetch,
    });
    expect(source.label).toBe('polling:https://api.example.com');
  });

  test('list() returns decoded intents from a successful response', async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          intents: [intentWire({ orderHash: '0xff' })],
          cursor: null,
        }),
        { status: 200 },
      )) as typeof fetch;

    const source = createPollingIntentSource({
      baseUrl: 'https://api.example.com',
      logger,
      fetch: fetchImpl,
    });

    const intents = await source.list();
    expect(intents.length).toBe(1);
    expect(intents[0]?.orderHash).toBe('0xff');
    // Wire bigints decode to bigint.
    expect(intents[0]?.input.amount).toBe(1_000_000_000n);
    expect(intents[0]?.observedAt).toBe(100n);
  });

  test('list() resolves to [] on non-2xx', async () => {
    const fetchImpl = (async () => new Response('nope', { status: 502 })) as typeof fetch;
    const source = createPollingIntentSource({
      baseUrl: 'https://api.example.com',
      logger,
      fetch: fetchImpl,
    });
    await expect(source.list()).resolves.toEqual([]);
  });

  test('list() resolves to [] on parse failure (malformed JSON)', async () => {
    const fetchImpl = (async () =>
      new Response('{ not json', { status: 200 })) as typeof fetch;
    const source = createPollingIntentSource({
      baseUrl: 'https://api.example.com',
      logger,
      fetch: fetchImpl,
    });
    await expect(source.list()).resolves.toEqual([]);
  });

  test('start() pushes intents to the sink + can be stopped', async () => {
    const responses = [
      JSON.stringify({ intents: [intentWire({ orderHash: '0x01' })], cursor: 'c1' }),
      JSON.stringify({ intents: [intentWire({ orderHash: '0x02' })], cursor: 'c2' }),
    ];
    let call = 0;
    const fetchImpl = (async () => {
      const body = responses[call] ?? responses[responses.length - 1] ?? '{}';
      call++;
      return new Response(body, { status: 200 });
    }) as typeof fetch;

    const source = createPollingIntentSource({
      baseUrl: 'https://api.example.com',
      intervalMs: 5,
      logger,
      fetch: fetchImpl,
    });

    const seen: string[] = [];
    const sink = {
      push: async (intent: { orderHash: string }) => {
        seen.push(intent.orderHash);
      },
      hasSubscribers: () => true,
    };
    const stop = await source.start(sink as never);
    await new Promise((r) => setTimeout(r, 30));
    await stop();
    // Two intents should land before stop.
    expect(seen).toContain('0x01');
    expect(seen).toContain('0x02');
  });

  test('start() skips work when no subscribers', async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return new Response(JSON.stringify({ intents: [], cursor: null }), { status: 200 });
    }) as typeof fetch;

    const source = createPollingIntentSource({
      baseUrl: 'https://api.example.com',
      intervalMs: 5,
      logger,
      fetch: fetchImpl,
    });

    const sink = {
      push: async () => undefined,
      hasSubscribers: () => false,
    };
    const stop = await source.start(sink as never);
    await new Promise((r) => setTimeout(r, 30));
    await stop();
    // Should not have called fetch at all.
    expect(calls).toBe(0);
  });

  test('start() backs off on failure + recovers when fetch succeeds', async () => {
    let call = 0;
    const fetchImpl = (async () => {
      call++;
      if (call <= 2) throw new Error('connection refused');
      return new Response(
        JSON.stringify({ intents: [intentWire({ orderHash: '0xee' })], cursor: null }),
        { status: 200 },
      );
    }) as typeof fetch;

    const source = createPollingIntentSource({
      baseUrl: 'https://api.example.com',
      intervalMs: 5,
      backoffBaseMs: 5,
      maxBackoffMs: 20,
      logger,
      fetch: fetchImpl,
    });

    const seen: string[] = [];
    const sink = {
      push: async (i: { orderHash: string }) => {
        seen.push(i.orderHash);
      },
      hasSubscribers: () => true,
    };
    const stop = await source.start(sink as never);
    await new Promise((r) => setTimeout(r, 100));
    await stop();
    expect(seen).toContain('0xee');
  });

  test('authToken is sent as Bearer header', async () => {
    let observedAuth: string | null = null;
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      const h = init?.headers as Record<string, string> | undefined;
      observedAuth = h?.['authorization'] ?? null;
      return new Response(JSON.stringify({ intents: [], cursor: null }), {
        status: 200,
      });
    }) as unknown as typeof fetch;

    const source = createPollingIntentSource({
      baseUrl: 'https://api.example.com',
      authToken: 'tok_secret',
      logger,
      fetch: fetchImpl,
    });

    await source.list();
    expect(observedAuth).toBe('Bearer tok_secret');
  });
});
