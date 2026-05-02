import { describe, expect, test } from 'vitest';

import { IndexerError, silenceLoggerForTests } from '../../src';
import {
  IndexerClient,
  decodeDepthHint,
} from '../../src/indexer/client';
import { logger } from '../../src/logger';

silenceLoggerForTests();

const POOL_A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as const;
const POOL_B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as const;
const POOL_C = '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc' as const;
const TOKEN_A = '0x1111111111111111111111111111111111111111' as const;
const TOKEN_B = '0x2222222222222222222222222222222222222222' as const;
const TOKEN_C = '0x3333333333333333333333333333333333333333' as const;
const ZERO_HOOK = '0x0000000000000000000000000000000000000000' as const;
const HOOKED = '0xdeaddeaddeaddeaddeaddeaddeaddeaddeaddead' as const;

function poolWire(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: POOL_A,
    chainId: 130,
    currency0: TOKEN_A,
    currency1: TOKEN_B,
    fee: 3000,
    tickSpacing: 60,
    hooks: ZERO_HOOK,
    sqrtPriceX96: '79228162514264337593543950336',
    liquidity: '1000000000000',
    tick: 0,
    initializedAt: '1',
    updatedAt: '2',
    ...overrides,
  };
}

function depthWire(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    pool: POOL_A,
    hint: {
      tickLower: -120,
      tickUpper: 120,
      liquidityDelta: '500000000000',
      expectedFeeCapture: '1000000',
      expectedSlippageBps: 10,
      expectedGasOverhead: '210000000000000',
      estimatedNetProfit: '789000',
    },
    poolState: {
      currentTick: 0,
      currentSqrtPrice: '79228162514264337593543950336',
    },
    ...overrides,
  };
}

function makeClient(opts: {
  fetch: typeof fetch;
  authToken?: string;
  timeoutMs?: number;
  baseUrl?: string;
}) {
  return new IndexerClient({
    baseUrl: opts.baseUrl ?? 'https://api.example.com',
    authToken: opts.authToken ?? '',
    timeoutMs: opts.timeoutMs ?? 5_000,
    logger,
    fetch: opts.fetch,
  });
}

// === decodeDepthHint pure helper =========================================

describe('decodeDepthHint', () => {
  test('decodes the full wire payload (with optional fields)', () => {
    const r = decodeDepthHint(depthWire());
    expect(r.pool).toBe(POOL_A);
    expect(r.hint.tickLower).toBe(-120);
    expect(r.hint.liquidityDelta).toBe(500_000_000_000n);
    expect(r.hint.expectedFeeCapture).toBe(1_000_000n);
    expect(r.hint.expectedSlippageBps).toBe(10);
    expect(r.hint.expectedGasOverhead).toBe(210_000_000_000_000n);
    expect(r.hint.estimatedNetProfit).toBe(789_000n);
    expect(r.poolState?.currentTick).toBe(0);
    expect(r.poolState?.currentSqrtPrice).toBe(79_228_162_514_264_337_593_543_950_336n);
  });

  test('decodes a minimal payload (no optional fields)', () => {
    const r = decodeDepthHint({
      pool: POOL_A,
      hint: {
        tickLower: -60,
        tickUpper: 60,
        liquidityDelta: '100',
        expectedFeeCapture: '50',
      },
    });
    expect(r.hint.expectedSlippageBps).toBeUndefined();
    expect(r.hint.expectedGasOverhead).toBeUndefined();
    expect(r.hint.estimatedNetProfit).toBeUndefined();
    expect(r.poolState).toBeUndefined();
  });

  test('throws IndexerError on malformed payload', () => {
    expect(() =>
      decodeDepthHint({ pool: 'not a hex', hint: {} } as never),
    ).toThrow(IndexerError);
  });
});

// === findPool ===========================================================

describe('IndexerClient.findPool', () => {
  test('queries /pools with chain + token + limit', async () => {
    let observedUrl: string | null = null;
    const fetchImpl = (async (url: string) => {
      observedUrl = url;
      return new Response(
        JSON.stringify({ pools: [poolWire()], count: 1 }),
        { status: 200 },
      );
    }) as typeof fetch;
    const client = makeClient({ fetch: fetchImpl });
    await client.findPool(TOKEN_A, TOKEN_B, 130);
    expect(observedUrl).toContain('/pools?');
    expect(observedUrl).toContain('chain=130');
    expect(observedUrl).toContain(`token=${TOKEN_A}`);
    expect(observedUrl).toContain('limit=200');
  });

  test('returns null when no pool contains the output token', async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          // Pool only has TOKEN_A + TOKEN_C; we ask for TOKEN_A → TOKEN_B.
          pools: [poolWire({ currency1: TOKEN_C, id: POOL_B })],
        }),
        { status: 200 },
      )) as typeof fetch;
    const client = makeClient({ fetch: fetchImpl });
    const r = await client.findPool(TOKEN_A, TOKEN_B, 130);
    expect(r).toBeNull();
  });

  test('returns null on empty pool list', async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ pools: [] }), { status: 200 })) as typeof fetch;
    const client = makeClient({ fetch: fetchImpl });
    const r = await client.findPool(TOKEN_A, TOKEN_B, 130);
    expect(r).toBeNull();
  });

  test('picks hookless pool over hooked pool (deterministic ordering)', async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          pools: [
            poolWire({ id: POOL_A, hooks: HOOKED, liquidity: '999999999' }),
            poolWire({ id: POOL_B, hooks: ZERO_HOOK, liquidity: '1' }),
          ],
        }),
        { status: 200 },
      )) as typeof fetch;
    const client = makeClient({ fetch: fetchImpl });
    const r = await client.findPool(TOKEN_A, TOKEN_B, 130);
    expect(r?.id).toBe(POOL_B);
    expect(r?.hooks.toLowerCase()).toBe(ZERO_HOOK);
  });

  test('among hookless pools, picks higher liquidity', async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          pools: [
            poolWire({ id: POOL_A, hooks: ZERO_HOOK, liquidity: '500' }),
            poolWire({ id: POOL_B, hooks: ZERO_HOOK, liquidity: '5000' }),
            poolWire({ id: POOL_C, hooks: ZERO_HOOK, liquidity: '50' }),
          ],
        }),
        { status: 200 },
      )) as typeof fetch;
    const client = makeClient({ fetch: fetchImpl });
    const r = await client.findPool(TOKEN_A, TOKEN_B, 130);
    expect(r?.id).toBe(POOL_B);
  });

  test('among same-liquidity hookless pools, picks lower fee', async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          pools: [
            poolWire({ id: POOL_A, fee: 3000, liquidity: '1000' }),
            poolWire({ id: POOL_B, fee: 500, liquidity: '1000' }),
          ],
        }),
        { status: 200 },
      )) as typeof fetch;
    const client = makeClient({ fetch: fetchImpl });
    const r = await client.findPool(TOKEN_A, TOKEN_B, 130);
    expect(r?.id).toBe(POOL_B);
    expect(r?.fee).toBe(500);
  });

  test('matches output token regardless of which currency slot it occupies', async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          pools: [
            poolWire({ currency0: TOKEN_B, currency1: TOKEN_A, id: POOL_C }),
          ],
        }),
        { status: 200 },
      )) as typeof fetch;
    const client = makeClient({ fetch: fetchImpl });
    const r = await client.findPool(TOKEN_A, TOKEN_B, 130);
    expect(r?.id).toBe(POOL_C);
  });

  test('matches token addresses case-insensitively', async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          pools: [poolWire({ currency1: TOKEN_B.toUpperCase() })],
        }),
        { status: 200 },
      )) as typeof fetch;
    const client = makeClient({ fetch: fetchImpl });
    const r = await client.findPool(
      TOKEN_A.toUpperCase() as `0x${string}`,
      TOKEN_B.toLowerCase() as `0x${string}`,
      130,
    );
    expect(r?.id).toBe(POOL_A);
  });

  test('throws IndexerError on malformed pool response', async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ pools: [{ id: 'not hex' }] }), {
        status: 200,
      })) as typeof fetch;
    const client = makeClient({ fetch: fetchImpl });
    await expect(client.findPool(TOKEN_A, TOKEN_B, 130)).rejects.toBeInstanceOf(
      IndexerError,
    );
  });

  test('throws IndexerError with status on 4xx (not retried)', async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return new Response('bad request', { status: 400 });
    }) as typeof fetch;
    const client = makeClient({ fetch: fetchImpl });
    await expect(client.findPool(TOKEN_A, TOKEN_B, 130)).rejects.toMatchObject({
      status: 400,
    });
    expect(calls).toBe(1);
  });
});

// === depth ===============================================================

describe('IndexerClient.depth', () => {
  test('happy path returns decoded hint', async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify(depthWire()), { status: 200 })) as typeof fetch;
    const client = makeClient({ fetch: fetchImpl });
    const r = await client.depth({ pool: POOL_A, size: 1n, zeroForOne: true });
    expect(r.hint.tickLower).toBe(-120);
    expect(r.hint.expectedFeeCapture).toBe(1_000_000n);
  });

  test('passes optional slippageBps + gasPriceGwei query params', async () => {
    let observedUrl: string | null = null;
    const fetchImpl = (async (url: string) => {
      observedUrl = url;
      return new Response(JSON.stringify(depthWire()), { status: 200 });
    }) as typeof fetch;
    const client = makeClient({ fetch: fetchImpl });
    await client.depth({
      pool: POOL_A,
      size: 1n,
      zeroForOne: false,
      slippageBps: 30,
      gasPriceGwei: 25,
    });
    expect(observedUrl).toContain('slippageBps=30');
    expect(observedUrl).toContain('gasPriceGwei=25');
    expect(observedUrl).toContain('zeroForOne=false');
  });

  test('throws IndexerError(404) when pool not indexed', async () => {
    const fetchImpl = (async () =>
      new Response('{}', { status: 404 })) as typeof fetch;
    const client = makeClient({ fetch: fetchImpl });
    await expect(
      client.depth({ pool: POOL_A, size: 1n, zeroForOne: true }),
    ).rejects.toMatchObject({ status: 404 });
  });

  test('retries on 5xx and recovers when next attempt succeeds', async () => {
    let call = 0;
    const fetchImpl = (async () => {
      call++;
      if (call === 1) return new Response('boom', { status: 503 });
      return new Response(JSON.stringify(depthWire()), { status: 200 });
    }) as typeof fetch;
    const client = makeClient({ fetch: fetchImpl });
    const r = await client.depth({ pool: POOL_A, size: 1n, zeroForOne: true });
    expect(r.hint.tickLower).toBe(-120);
    expect(call).toBe(2);
  }, 10_000);

  test('throws IndexerError after exhausting retries', async () => {
    let call = 0;
    const fetchImpl = (async () => {
      call++;
      return new Response('boom', { status: 503 });
    }) as typeof fetch;
    const client = makeClient({ fetch: fetchImpl });
    await expect(
      client.depth({ pool: POOL_A, size: 1n, zeroForOne: true }),
    ).rejects.toBeInstanceOf(IndexerError);
    expect(call).toBe(3);
  }, 10_000);
});

// === health =============================================================

describe('IndexerClient.health', () => {
  test('decodes status + chains', async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          status: 'ok',
          chains: [
            { chainId: 130, latestBlock: '12345', lastUpdatedAt: '67890' },
            { chainId: 1, latestBlock: null, lastUpdatedAt: null },
          ],
        }),
        { status: 200 },
      )) as typeof fetch;
    const client = makeClient({ fetch: fetchImpl });
    const r = await client.health();
    expect(r.status).toBe('ok');
    expect(r.chains).toHaveLength(2);
    expect(r.chains[0]?.chainId).toBe(130);
    expect(r.chains[0]?.latestBlock).toBe(12345n);
    expect(r.chains[1]?.latestBlock).toBe(0n);
  });

  test('throws on malformed response', async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ status: 'mystery' }), {
        status: 200,
      })) as typeof fetch;
    const client = makeClient({ fetch: fetchImpl });
    await expect(client.health()).rejects.toBeInstanceOf(IndexerError);
  });
});

// === Bearer auth ========================================================

describe('IndexerClient — auth header', () => {
  test('sends Bearer token when authToken is set', async () => {
    let observedAuth: string | null = null;
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      const h = init?.headers as Record<string, string> | undefined;
      observedAuth = h?.['authorization'] ?? null;
      return new Response(JSON.stringify({ pools: [] }), { status: 200 });
    }) as unknown as typeof fetch;
    const client = makeClient({ fetch: fetchImpl, authToken: 'tok_secret' });
    await client.findPool(TOKEN_A, TOKEN_B, 130);
    expect(observedAuth).toBe('Bearer tok_secret');
    expect(client.authenticated).toBe(true);
  });

  test('does NOT send authorization header when authToken is empty', async () => {
    let observedAuth: string | null | undefined = undefined;
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      const h = init?.headers as Record<string, string> | undefined;
      observedAuth = h?.['authorization'] ?? null;
      return new Response(JSON.stringify({ pools: [] }), { status: 200 });
    }) as unknown as typeof fetch;
    const client = makeClient({ fetch: fetchImpl, authToken: '' });
    await client.findPool(TOKEN_A, TOKEN_B, 130);
    expect(observedAuth).toBeNull();
    expect(client.authenticated).toBe(false);
  });
});

// === subscribeDepth (SSE) ==============================================

function makeSseStream(frames: string[]): typeof fetch {
  // Encode the frames into a single ReadableStream so the client's reader
  // sees them in one shot. Each frame is `event: depth\ndata: {...}\n\n`.
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const frame of frames) {
        controller.enqueue(encoder.encode(frame));
      }
      controller.close();
    },
  });
  return (async () =>
    new Response(body, {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    })) as unknown as typeof fetch;
}

describe('IndexerClient.subscribeDepth (SSE)', () => {
  test('decodes a single SSE frame and invokes the callback', async () => {
    const frames = [
      `event: depth\ndata: ${JSON.stringify(depthWire())}\n\n`,
    ];
    const client = makeClient({ fetch: makeSseStream(frames) });
    const seen: number[] = [];
    const unsubscribe = client.subscribeDepth(
      { pool: POOL_A, size: 1n, zeroForOne: true },
      (hint) => {
        seen.push(hint.hint.tickLower);
      },
    );
    await new Promise((r) => setTimeout(r, 50));
    unsubscribe();
    expect(seen).toEqual([-120]);
  });

  test('decodes multiple frames in sequence', async () => {
    const frames = [
      `event: depth\ndata: ${JSON.stringify(depthWire({ pool: POOL_A }))}\n\n`,
      `event: depth\ndata: ${JSON.stringify({ ...depthWire(), hint: { ...depthWire().hint, tickLower: -240 } })}\n\n`,
    ];
    const client = makeClient({ fetch: makeSseStream(frames) });
    const seen: number[] = [];
    const unsubscribe = client.subscribeDepth(
      { pool: POOL_A, size: 1n, zeroForOne: true },
      (hint) => {
        seen.push(hint.hint.tickLower);
      },
    );
    await new Promise((r) => setTimeout(r, 50));
    unsubscribe();
    expect(seen).toEqual([-120, -240]);
  });

  test('skips malformed frames + survives (logs warning, keeps streaming)', async () => {
    const frames = [
      `event: depth\ndata: not json\n\n`,
      `event: depth\ndata: ${JSON.stringify(depthWire())}\n\n`,
    ];
    const client = makeClient({ fetch: makeSseStream(frames) });
    const seen: number[] = [];
    const unsubscribe = client.subscribeDepth(
      { pool: POOL_A, size: 1n, zeroForOne: true },
      (hint) => {
        seen.push(hint.hint.tickLower);
      },
    );
    await new Promise((r) => setTimeout(r, 50));
    unsubscribe();
    expect(seen).toEqual([-120]);
  });

  test('ignores comment frames (heartbeats start with `:`)', async () => {
    const frames = [
      `: keep-alive\n\n`,
      `event: depth\ndata: ${JSON.stringify(depthWire())}\n\n`,
    ];
    const client = makeClient({ fetch: makeSseStream(frames) });
    const seen: number[] = [];
    const unsubscribe = client.subscribeDepth(
      { pool: POOL_A, size: 1n, zeroForOne: true },
      (hint) => {
        seen.push(hint.hint.tickLower);
      },
    );
    await new Promise((r) => setTimeout(r, 50));
    unsubscribe();
    expect(seen).toEqual([-120]);
  });

  test('stop fn aborts the in-flight stream', async () => {
    let aborted = false;
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      const sig = init?.signal;
      // Hang the stream until aborted.
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          sig?.addEventListener('abort', () => {
            aborted = true;
            controller.error(new Error('aborted'));
          });
        },
      });
      return new Response(body, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      });
    }) as unknown as typeof fetch;
    const client = makeClient({ fetch: fetchImpl });
    const unsubscribe = client.subscribeDepth(
      { pool: POOL_A, size: 1n, zeroForOne: true },
      () => undefined,
    );
    await new Promise((r) => setTimeout(r, 30));
    unsubscribe();
    await new Promise((r) => setTimeout(r, 20));
    expect(aborted).toBe(true);
  });

  test('reconnects after a transient HTTP failure', async () => {
    let callCount = 0;
    const fetchImpl = (async () => {
      callCount++;
      if (callCount === 1) {
        return new Response('upstream error', { status: 502 });
      }
      const encoder = new TextEncoder();
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              `event: depth\ndata: ${JSON.stringify(depthWire())}\n\n`,
            ),
          );
          controller.close();
        },
      });
      return new Response(body, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      });
    }) as unknown as typeof fetch;
    const client = makeClient({ fetch: fetchImpl });
    const seen: number[] = [];
    const unsubscribe = client.subscribeDepth(
      { pool: POOL_A, size: 1n, zeroForOne: true },
      (hint) => {
        seen.push(hint.hint.tickLower);
      },
    );
    await new Promise((r) => setTimeout(r, 1500));
    unsubscribe();
    expect(callCount).toBeGreaterThanOrEqual(2);
    expect(seen).toContain(-120);
  }, 10_000);
});
