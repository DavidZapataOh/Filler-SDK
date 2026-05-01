import { describe, expect, test } from 'vitest';

import { silenceLoggerForTests } from '../../src';
import { IntentStream } from '../../src/intents/stream';
import { createMockIntentSource } from '../../src/intents/mockSource';
import { logger } from '../../src/logger';
import { TOKENS, REACTOR_ADDR, makeIntent } from './fixtures';

silenceLoggerForTests();

const STUB_PUBLIC_CLIENT = {};

function makeStream(opts: {
  source?: ReturnType<typeof createMockIntentSource>;
  maxQueueSize?: number;
  dropPolicy?: 'oldest' | 'newest';
} = {}) {
  const cfg: ConstructorParameters<typeof IntentStream>[0] = {
    publicClient: STUB_PUBLIC_CLIENT,
    reactorAddress: REACTOR_ADDR,
    logger,
  };
  if (opts.source !== undefined) cfg.source = opts.source;
  if (opts.maxQueueSize !== undefined) cfg.maxQueueSize = opts.maxQueueSize;
  if (opts.dropPolicy !== undefined) cfg.dropPolicy = opts.dropPolicy;
  return new IntentStream(cfg);
}

// Allow event loop microtasks + the lazy-source-start promise to settle.
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

describe('IntentStream — lifecycle', () => {
  test('subscribe lazy-boots the source on first subscriber', async () => {
    const source = createMockIntentSource();
    const stream = makeStream({ source });
    expect(source.startCount).toBe(0);

    stream.subscribe({}, () => {
      // no-op
    });
    await flush();
    expect(source.startCount).toBe(1);
    expect(source.started).toBe(true);
  });

  test('second subscribe does NOT restart the source', async () => {
    const source = createMockIntentSource();
    const stream = makeStream({ source });
    stream.subscribe({}, () => undefined);
    await flush();
    stream.subscribe({}, () => undefined);
    await flush();
    expect(source.startCount).toBe(1);
  });

  test('unsubscribe does NOT stop the source (avoids start/stop thrash)', async () => {
    const source = createMockIntentSource();
    const stream = makeStream({ source });
    const unsub = stream.subscribe({}, () => undefined);
    await flush();
    unsub();
    expect(source.stopCount).toBe(0);
    expect(source.started).toBe(true);
  });

  test('close() stops the source + clears subscribers (idempotent)', async () => {
    const source = createMockIntentSource();
    const stream = makeStream({ source });
    stream.subscribe({}, () => undefined);
    await flush();
    await stream.close();
    expect(source.stopCount).toBe(1);
    expect(stream.subscriptionCount).toBe(0);
    await stream.close(); // second call is no-op
    expect(source.stopCount).toBe(1);
  });

  test('close() prevents subsequent subscribes (loud failure)', async () => {
    const stream = makeStream({ source: createMockIntentSource() });
    await stream.close();
    expect(() => stream.subscribe({}, () => undefined)).toThrow(/closed/);
  });

  test('list() resolves to [] when no source is wired', async () => {
    const stream = makeStream();
    await expect(stream.list()).resolves.toEqual([]);
  });

  test('list() delegates to source + applies the source-side filter', async () => {
    const initial = [
      makeIntent({ orderHash: '0x01' as `0x${string}`, chainId: 130 }),
      makeIntent({ orderHash: '0x02' as `0x${string}`, chainId: 1 }),
    ];
    const source = createMockIntentSource({ initial });
    const stream = makeStream({ source });
    const all = await stream.list();
    expect(all.length).toBe(2);
    const onlyUnichain = await stream.list({ chainIds: [130] });
    expect(onlyUnichain.length).toBe(1);
    expect(onlyUnichain[0]?.orderHash).toBe('0x01');
  });
});

describe('IntentStream — filter routing', () => {
  test('criteria filter — chainIds match wins', async () => {
    const source = createMockIntentSource();
    const stream = makeStream({ source });
    const seen: string[] = [];
    stream.subscribe({ chainIds: [130] }, (intent) => {
      seen.push(intent.orderHash);
    });
    await flush();
    await source.pushIntent(makeIntent({ orderHash: '0xaa', chainId: 130 }));
    await source.pushIntent(makeIntent({ orderHash: '0xbb', chainId: 1 }));
    await flush();
    expect(seen).toEqual(['0xaa']);
  });

  test('criteria filter — input token check is case-insensitive', async () => {
    const source = createMockIntentSource();
    const stream = makeStream({ source });
    const seen: string[] = [];
    stream.subscribe(
      { inputTokens: [TOKENS.USDC.toUpperCase() as `0x${string}`] },
      (intent) => {
        seen.push(intent.orderHash);
      },
    );
    await flush();
    await source.pushIntent(makeIntent({ orderHash: '0xaa' }));
    await flush();
    expect(seen).toEqual(['0xaa']);
  });

  test('criteria filter — minInputAmount drops dust', async () => {
    const source = createMockIntentSource();
    const stream = makeStream({ source });
    const seen: string[] = [];
    stream.subscribe({ minInputAmount: 100n }, (intent) => {
      seen.push(intent.orderHash);
    });
    await flush();
    await source.pushIntent(
      makeIntent({ orderHash: '0xaa', input: { token: TOKENS.USDC, amount: 50n } }),
    );
    await source.pushIntent(
      makeIntent({ orderHash: '0xbb', input: { token: TOKENS.USDC, amount: 200n } }),
    );
    await flush();
    expect(seen).toEqual(['0xbb']);
  });

  test('predicate filter — sync', async () => {
    const source = createMockIntentSource();
    const stream = makeStream({ source });
    const seen: string[] = [];
    const predicate = (i: { input: { amount: bigint } }) => i.input.amount > 100n;
    stream.subscribe(predicate as never, (intent) => {
      seen.push(intent.orderHash);
    });
    await flush();
    await source.pushIntent(
      makeIntent({ orderHash: '0xaa', input: { token: TOKENS.USDC, amount: 10n } }),
    );
    await source.pushIntent(
      makeIntent({ orderHash: '0xbb', input: { token: TOKENS.USDC, amount: 200n } }),
    );
    await flush();
    expect(seen).toEqual(['0xbb']);
  });

  test('predicate filter — async', async () => {
    const source = createMockIntentSource();
    const stream = makeStream({ source });
    const seen: string[] = [];
    const predicate = async (i: { chainId: number }) => {
      await new Promise((r) => setTimeout(r, 1));
      return i.chainId === 130;
    };
    stream.subscribe(predicate as never, (intent) => {
      seen.push(intent.orderHash);
    });
    await flush();
    await source.pushIntent(makeIntent({ orderHash: '0xaa', chainId: 130 }));
    await source.pushIntent(makeIntent({ orderHash: '0xbb', chainId: 1 }));
    await new Promise((r) => setTimeout(r, 5));
    expect(seen).toEqual(['0xaa']);
  });

  test('filter throw is treated as non-match (subscription survives)', async () => {
    const source = createMockIntentSource();
    const stream = makeStream({ source });
    const seen: string[] = [];
    let throwOnNext = true;
    const predicate = () => {
      if (throwOnNext) {
        throwOnNext = false;
        throw new Error('boom');
      }
      return true;
    };
    stream.subscribe(predicate as never, (intent) => {
      seen.push(intent.orderHash);
    });
    await flush();
    await source.pushIntent(makeIntent({ orderHash: '0xaa' }));
    await source.pushIntent(makeIntent({ orderHash: '0xbb' }));
    await flush();
    expect(seen).toEqual(['0xbb']);
  });
});

describe('IntentStream — backpressure', () => {
  test('queue full + drop policy "oldest" — drops front, bumps counter', async () => {
    const source = createMockIntentSource();
    const stream = makeStream({ source, maxQueueSize: 2, dropPolicy: 'oldest' });
    let block = true;
    const seen: string[] = [];
    stream.subscribe({}, async (intent) => {
      // First handler call holds the queue so we can fill it up.
      while (block) await new Promise((r) => setTimeout(r, 1));
      seen.push(intent.orderHash);
    });
    await flush();
    // The first push is taken off immediately by the drain loop and held;
    // pushes 2..4 land in the queue (max 2). #2 gets dropped when #4 arrives.
    await source.pushIntent(makeIntent({ orderHash: '0x01' }));
    await source.pushIntent(makeIntent({ orderHash: '0x02' }));
    await source.pushIntent(makeIntent({ orderHash: '0x03' }));
    await source.pushIntent(makeIntent({ orderHash: '0x04' }));
    block = false;
    await new Promise((r) => setTimeout(r, 20));
    expect(stream.droppedTotal).toBeGreaterThan(0);
    // The first intent is processed; #2 dropped to make room; #3 + #4 land.
    expect(seen).toContain('0x01');
    expect(seen).not.toContain('0x02');
    expect(seen).toContain('0x04');
  });

  test('queue full + drop policy "newest" — keeps queue, drops inbound', async () => {
    const source = createMockIntentSource();
    const stream = makeStream({ source, maxQueueSize: 1, dropPolicy: 'newest' });
    let block = true;
    const seen: string[] = [];
    stream.subscribe({}, async (intent) => {
      while (block) await new Promise((r) => setTimeout(r, 1));
      seen.push(intent.orderHash);
    });
    await flush();
    await source.pushIntent(makeIntent({ orderHash: '0x01' })); // taken by drain
    await source.pushIntent(makeIntent({ orderHash: '0x02' })); // queued
    await source.pushIntent(makeIntent({ orderHash: '0x03' })); // dropped (newest)
    await source.pushIntent(makeIntent({ orderHash: '0x04' })); // dropped (newest)
    block = false;
    await new Promise((r) => setTimeout(r, 20));
    expect(stream.droppedTotal).toBe(2);
    expect(seen).toEqual(['0x01', '0x02']);
  });

  test('handler error is logged + subscription survives', async () => {
    const source = createMockIntentSource();
    const stream = makeStream({ source });
    let calls = 0;
    stream.subscribe({}, async () => {
      calls++;
      if (calls === 1) throw new Error('boom');
    });
    await flush();
    await source.pushIntent(makeIntent({ orderHash: '0xaa' }));
    await source.pushIntent(makeIntent({ orderHash: '0xbb' }));
    await flush();
    expect(calls).toBe(2);
  });
});

describe('IntentStream — observability', () => {
  test('subscriptionCount + droppedTotal + lastIntentAt + sourceLabel', async () => {
    const source = createMockIntentSource({ label: 'tests:mock-1' });
    const stream = makeStream({ source });
    expect(stream.subscriptionCount).toBe(0);
    expect(stream.droppedTotal).toBe(0);
    expect(stream.lastIntentAt).toBeUndefined();
    expect(stream.hasSource).toBe(true);
    expect(stream.sourceLabel).toBe('tests:mock-1');

    const unsub = stream.subscribe({}, () => undefined);
    await flush();
    expect(stream.subscriptionCount).toBe(1);
    await source.pushIntent(makeIntent({ orderHash: '0xaa', observedAt: 42n }));
    await flush();
    expect(stream.lastIntentAt).toBe(42n);
    unsub();
    expect(stream.subscriptionCount).toBe(0);
  });

  test('hasSubscribers reflects engine state for sources to skip work', async () => {
    const source = createMockIntentSource();
    const stream = makeStream({ source });
    stream.subscribe({}, () => undefined);
    await flush();
    expect(source.lastSink?.hasSubscribers()).toBe(true);
    await stream.close();
  });
});
