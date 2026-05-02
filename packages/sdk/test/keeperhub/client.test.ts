import { describe, expect, test } from 'vitest';

import {
  BroadcastFailedError,
  ConfigInvalidError,
  RPCError,
  TimeoutError,
  silenceLoggerForTests,
} from '../../src';
import { KeeperHubClient, pollWaitMs } from '../../src/keeperhub/client';
import { logger } from '../../src/logger';
import { makeFillParams, makeIntent, TEST_ADDRESSES } from '../fills/fixtures';

silenceLoggerForTests();

const ACCOUNT = '0xacacacacacacacacacacacacacacacacacacacac' as const;
const FILLER_CONTRACT = TEST_ADDRESSES.FILLER;
const TX_HASH = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

interface ResponseSeq {
  status?: number;
  body?: unknown;
  delayMs?: number;
  throw?: Error;
}

function makeFetch(
  sequence: ResponseSeq[],
): {
  fetch: typeof fetch;
  calls: { url: string; init: RequestInit | undefined }[];
} {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  let i = 0;
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const next = sequence[i] ?? sequence[sequence.length - 1] ?? {};
    i++;
    if (next.delayMs !== undefined) {
      await new Promise((r) => setTimeout(r, next.delayMs));
    }
    if (next.throw !== undefined) {
      throw next.throw;
    }
    return new Response(JSON.stringify(next.body ?? {}), {
      status: next.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
  return { fetch: fetchImpl, calls };
}

function makeClient(opts: {
  fetch: typeof fetch;
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
  requestTimeoutMs?: number;
}): KeeperHubClient {
  return new KeeperHubClient({
    baseUrl: opts.baseUrl ?? 'https://keeperhub.example.com',
    apiKey: opts.apiKey ?? 'tok_test',
    chainId: 130,
    account: ACCOUNT,
    fillerContract: FILLER_CONTRACT,
    logger,
    fetch: opts.fetch,
    ...(opts.timeoutMs !== undefined ? { timeoutMs: opts.timeoutMs } : {}),
    ...(opts.requestTimeoutMs !== undefined
      ? { requestTimeoutMs: opts.requestTimeoutMs }
      : {}),
  });
}

// === pollWaitMs ===========================================================

describe('pollWaitMs', () => {
  test('1s, 2s, 4s, 4s, 4s schedule', () => {
    expect(pollWaitMs(1)).toBe(1_000);
    expect(pollWaitMs(2)).toBe(2_000);
    expect(pollWaitMs(3)).toBe(4_000);
    expect(pollWaitMs(4)).toBe(4_000);
    expect(pollWaitMs(10)).toBe(4_000);
  });
});

// === Identity ============================================================

describe('KeeperHubClient identity', () => {
  test('exposes baseUrl + chainId + account + fillerContract', () => {
    const { fetch } = makeFetch([]);
    const client = makeClient({ fetch });
    expect(client.baseUrl).toBe('https://keeperhub.example.com');
    expect(client.chainId).toBe(130);
    expect(client.account).toBe(ACCOUNT);
    expect(client.fillerContract).toBe(FILLER_CONTRACT);
    expect(client.timeoutMs).toBe(60_000);
  });

  test('strips trailing slash from baseUrl', () => {
    const { fetch } = makeFetch([]);
    const client = makeClient({
      fetch,
      baseUrl: 'https://keeperhub.example.com////',
    });
    expect(client.baseUrl).toBe('https://keeperhub.example.com');
  });
});

// === submitFill ==========================================================

describe('KeeperHubClient.submitFill', () => {
  test('submits + polls completed → returns FillResult', async () => {
    const { fetch, calls } = makeFetch([
      { status: 200, body: { workflowId: 'wf-1', status: 'pending' } },
      {
        status: 200,
        body: {
          workflowId: 'wf-1',
          status: 'completed',
          result: {
            txHash: TX_HASH,
            blockNumber: '12345',
            gasUsed: '500000',
            effectiveGasPriceWei: '2000000000',
          },
        },
      },
    ]);
    const client = makeClient({ fetch });
    const result = await client.submitFill(
      makeIntent(),
      makeFillParams(),
      600_000n,
    );
    expect(result.txHash).toBe(TX_HASH);
    expect(result.blockNumber).toBe(12_345n);
    expect(result.gasUsed).toBe(500_000n);
    expect(result.effectiveGasPriceWei).toBe(2_000_000_000n);
    expect(calls[0]?.url).toContain('/workflows/submit');
    expect(calls[1]?.url).toContain('/workflows/wf-1');
  }, 10_000);

  test('POST submit body has decimal-string bigints + correct shape', async () => {
    const { fetch, calls } = makeFetch([
      { status: 200, body: { workflowId: 'wf-2', status: 'pending' } },
      {
        status: 200,
        body: {
          workflowId: 'wf-2',
          status: 'completed',
          result: {
            txHash: TX_HASH,
            blockNumber: '1',
            gasUsed: '1',
          },
        },
      },
    ]);
    const client = makeClient({ fetch });
    await client.submitFill(makeIntent(), makeFillParams(), 600_000n);
    const submitInit = calls[0]?.init;
    expect(submitInit?.method).toBe('POST');
    const body = JSON.parse(submitInit?.body as string) as Record<string, unknown>;
    expect(body['type']).toBe('uniswapx_fill');
    expect(body['chainId']).toBe(130);
    expect(body['fillerAddress']).toBe(FILLER_CONTRACT);
    expect(body['gasLimit']).toBe('600000');
    expect(body['privateRouting']).toBe(true);
    const order = body['order'] as Record<string, unknown>;
    expect(order['rawOrder']).toBe('0xdeadbeef');
    expect(order['signature']).toBe('0xcafebabe');
  });

  test('Bearer auth header sent on every request', async () => {
    const { fetch, calls } = makeFetch([
      { status: 200, body: { workflowId: 'wf-3', status: 'pending' } },
      {
        status: 200,
        body: {
          workflowId: 'wf-3',
          status: 'completed',
          result: { txHash: TX_HASH, blockNumber: '1', gasUsed: '1' },
        },
      },
    ]);
    const client = makeClient({ fetch, apiKey: 'tok_secret_xyz' });
    await client.submitFill(makeIntent(), makeFillParams(), 100n);
    const headers0 = calls[0]?.init?.headers as Record<string, string>;
    expect(headers0?.['authorization']).toBe('Bearer tok_secret_xyz');
    const headers1 = calls[1]?.init?.headers as Record<string, string>;
    expect(headers1?.['authorization']).toBe('Bearer tok_secret_xyz');
  });

  test('rejects with ConfigInvalidError when apiKey is empty', async () => {
    const { fetch } = makeFetch([]);
    const client = makeClient({ fetch, apiKey: '' });
    await expect(
      client.submitFill(makeIntent(), makeFillParams(), 100n),
    ).rejects.toBeInstanceOf(ConfigInvalidError);
  });

  test('throws BroadcastFailedError on workflow status=failed', async () => {
    const { fetch } = makeFetch([
      { status: 200, body: { workflowId: 'wf-4', status: 'pending' } },
      {
        status: 200,
        body: {
          workflowId: 'wf-4',
          status: 'failed',
          error: 'simulation reverted: InvalidFillParams',
        },
      },
    ]);
    const client = makeClient({ fetch });
    await expect(
      client.submitFill(makeIntent(), makeFillParams(), 100n),
    ).rejects.toBeInstanceOf(BroadcastFailedError);
  }, 10_000);

  test('throws BroadcastFailedError on completed-without-result', async () => {
    const { fetch } = makeFetch([
      { status: 200, body: { workflowId: 'wf-5', status: 'pending' } },
      {
        status: 200,
        body: { workflowId: 'wf-5', status: 'completed' /* no result */ },
      },
    ]);
    const client = makeClient({ fetch });
    await expect(
      client.submitFill(makeIntent(), makeFillParams(), 100n),
    ).rejects.toBeInstanceOf(BroadcastFailedError);
  }, 10_000);

  test('throws TimeoutError when workflow does not resolve within timeoutMs', async () => {
    const { fetch } = makeFetch([
      { status: 200, body: { workflowId: 'wf-6', status: 'pending' } },
      // All subsequent polls return pending; the workflow timeoutMs (set
      // small here for the test) elapses before completion.
      { status: 200, body: { workflowId: 'wf-6', status: 'pending' } },
    ]);
    const client = makeClient({ fetch, timeoutMs: 200 });
    await expect(
      client.submitFill(makeIntent(), makeFillParams(), 100n),
    ).rejects.toBeInstanceOf(TimeoutError);
  }, 10_000);

  test('retries on transient poll failure + recovers', async () => {
    const { fetch } = makeFetch([
      { status: 200, body: { workflowId: 'wf-7', status: 'pending' } },
      // Poll #1 fails (network error).
      { throw: new Error('connection reset') },
      // Poll #2 succeeds with completed.
      {
        status: 200,
        body: {
          workflowId: 'wf-7',
          status: 'completed',
          result: { txHash: TX_HASH, blockNumber: '99', gasUsed: '1000' },
        },
      },
    ]);
    const client = makeClient({ fetch });
    const result = await client.submitFill(
      makeIntent(),
      makeFillParams(),
      100n,
    );
    expect(result.txHash).toBe(TX_HASH);
    expect(result.blockNumber).toBe(99n);
  }, 10_000);

  test('throws RPCError on non-2xx submit response', async () => {
    const { fetch } = makeFetch([{ status: 500, body: { error: 'down' } }]);
    const client = makeClient({ fetch });
    await expect(
      client.submitFill(makeIntent(), makeFillParams(), 100n),
    ).rejects.toBeInstanceOf(RPCError);
  });

  test('throws RPCError on malformed submit response (missing workflowId)', async () => {
    const { fetch } = makeFetch([
      { status: 200, body: { status: 'pending' /* no workflowId */ } },
    ]);
    const client = makeClient({ fetch });
    await expect(
      client.submitFill(makeIntent(), makeFillParams(), 100n),
    ).rejects.toBeInstanceOf(RPCError);
  });

  test('AbortSignal aborts the polling loop with TimeoutError', async () => {
    const { fetch } = makeFetch([
      { status: 200, body: { workflowId: 'wf-8', status: 'pending' } },
      { status: 200, body: { workflowId: 'wf-8', status: 'pending' } },
    ]);
    const client = makeClient({ fetch });
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 50);
    await expect(
      client.submitFill(makeIntent(), makeFillParams(), 100n, {
        signal: ctrl.signal,
      }),
    ).rejects.toBeInstanceOf(TimeoutError);
  }, 10_000);

  test('forwards retry hint into the submit body', async () => {
    const { fetch, calls } = makeFetch([
      { status: 200, body: { workflowId: 'wf-9', status: 'pending' } },
      {
        status: 200,
        body: {
          workflowId: 'wf-9',
          status: 'completed',
          result: { txHash: TX_HASH, blockNumber: '1', gasUsed: '1' },
        },
      },
    ]);
    const client = makeClient({ fetch });
    await client.submitFill(makeIntent(), makeFillParams(), 100n, {
      retry: { maxAttempts: 5, backoffMs: 3_000 },
    });
    const body = JSON.parse(calls[0]?.init?.body as string) as Record<string, unknown>;
    expect(body['retryPolicy']).toEqual({ maxAttempts: 5, backoffMs: 3_000 });
  });
});

// === getStatus ===========================================================

describe('KeeperHubClient.getStatus', () => {
  test('decodes a typical pending status response', async () => {
    const { fetch } = makeFetch([
      { status: 200, body: { workflowId: 'abc', status: 'pending' } },
    ]);
    const client = makeClient({ fetch });
    const r = await client.getStatus('abc');
    expect(r.status).toBe('pending');
    expect(r.workflowId).toBe('abc');
  });

  test('decodes a completed status with result', async () => {
    const { fetch } = makeFetch([
      {
        status: 200,
        body: {
          workflowId: 'abc',
          status: 'completed',
          result: {
            txHash: TX_HASH,
            blockNumber: '7',
            gasUsed: '8',
          },
        },
      },
    ]);
    const client = makeClient({ fetch });
    const r = await client.getStatus('abc');
    expect(r.result?.txHash).toBe(TX_HASH);
  });

  test('throws ConfigInvalidError on empty workflowId', async () => {
    const { fetch } = makeFetch([]);
    const client = makeClient({ fetch });
    await expect(client.getStatus('')).rejects.toBeInstanceOf(
      ConfigInvalidError,
    );
  });

  test('URL-encodes workflowId with special characters', async () => {
    const { fetch, calls } = makeFetch([
      { status: 200, body: { workflowId: 'wf/with/slashes', status: 'pending' } },
    ]);
    const client = makeClient({ fetch });
    await client.getStatus('wf/with/slashes');
    expect(calls[0]?.url).toContain('/workflows/wf%2Fwith%2Fslashes');
  });
});
