import { describe, expect, test } from 'vitest';

import { createMetrics } from '../../src/api/metrics';
import { startIndexerLagMonitor } from '../../src/observability/indexerLag';
import { buildMockDb, makePool } from '../api/fixtures';

const FAKE_INTERVAL = (() => ({ unref() {} }));

describe('startIndexerLagMonitor', () => {
  test('observes lag = (tip - indexed) × blockTimeSec for each chain', async () => {
    const db = buildMockDb({
      pools: [makePool({ chainId: 1, updatedAt: 21_000_000n })],
      ticks: [],
      chainStatus: [],
    });
    const metrics = createMetrics();

    const monitor = startIndexerLagMonitor({
      db,
      metrics,
      chains: [{ chainId: 1, name: 'mainnet', blockTimeSec: 12 }],
      fetchTipBlock: async () => 21_000_005n,
      setIntervalImpl: FAKE_INTERVAL,
    });

    await monitor.pollOnce();

    const lag = await metrics.indexerLagSeconds.get();
    const sample = lag.values.find((v) => v.metricName === 'jit_hints_indexer_lag_seconds_sum');
    expect(sample?.value).toBe(60); // 5 blocks × 12 sec
    expect(sample?.labels.chainId).toBe('1');

    monitor.stop();
  });

  test('updates indexedPools gauge from countPools', async () => {
    const db = buildMockDb({
      pools: [
        makePool({ chainId: 1, updatedAt: 1n }),
        makePool({
          id: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          chainId: 1,
          updatedAt: 2n,
        }),
        makePool({
          id: '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
          chainId: 130,
          updatedAt: 3n,
        }),
      ],
      ticks: [],
      chainStatus: [],
    });
    const metrics = createMetrics();

    const monitor = startIndexerLagMonitor({
      db,
      metrics,
      chains: [
        { chainId: 1, name: 'mainnet', blockTimeSec: 12 },
        { chainId: 130, name: 'unichain', blockTimeSec: 1 },
      ],
      fetchTipBlock: async () => 100n,
      setIntervalImpl: FAKE_INTERVAL,
    });

    await monitor.pollOnce();

    const pools = await metrics.indexedPools.get();
    expect(pools.values.find((v) => v.labels.chainId === '1')?.value).toBe(2);
    expect(pools.values.find((v) => v.labels.chainId === '130')?.value).toBe(1);

    monitor.stop();
  });

  test('skips lag observation when no pools indexed yet', async () => {
    const db = buildMockDb({
      pools: [],
      ticks: [],
      chainStatus: [],
    });
    const metrics = createMetrics();

    const monitor = startIndexerLagMonitor({
      db,
      metrics,
      chains: [{ chainId: 1, name: 'mainnet', blockTimeSec: 12 }],
      fetchTipBlock: async () => 100n,
      setIntervalImpl: FAKE_INTERVAL,
    });

    await monitor.pollOnce();

    const lag = await metrics.indexerLagSeconds.get();
    expect(lag.values.length).toBe(0);

    monitor.stop();
  });

  test('reports zero lag when indexed block is ahead of tip (defensive)', async () => {
    const db = buildMockDb({
      pools: [makePool({ chainId: 1, updatedAt: 100n })],
      ticks: [],
      chainStatus: [],
    });
    const metrics = createMetrics();

    const monitor = startIndexerLagMonitor({
      db,
      metrics,
      chains: [{ chainId: 1, name: 'mainnet', blockTimeSec: 12 }],
      fetchTipBlock: async () => 50n, // tip BEHIND indexed (RPC lying / lag)
      setIntervalImpl: FAKE_INTERVAL,
    });

    await monitor.pollOnce();

    const lag = await metrics.indexerLagSeconds.get();
    const sum = lag.values.find(
      (v) => v.metricName === 'jit_hints_indexer_lag_seconds_sum',
    );
    expect(sum?.value).toBe(0);

    monitor.stop();
  });

  test('errors are routed to onError callback (not thrown)', async () => {
    const db = buildMockDb({
      pools: [makePool()],
      ticks: [],
      chainStatus: [],
    });
    const metrics = createMetrics();
    const errors: Array<{ chainId: number; err: unknown }> = [];

    const monitor = startIndexerLagMonitor({
      db,
      metrics,
      chains: [{ chainId: 1, name: 'mainnet', blockTimeSec: 12 }],
      fetchTipBlock: async () => {
        throw new Error('rpc unreachable');
      },
      onError: (chainId, _name, err) => errors.push({ chainId, err }),
      setIntervalImpl: FAKE_INTERVAL,
    });

    await monitor.pollOnce();

    expect(errors).toHaveLength(1);
    expect(errors[0]?.chainId).toBe(1);
    expect((errors[0]?.err as Error).message).toBe('rpc unreachable');

    monitor.stop();
  });

  test('onLag callback fires per chain with computed seconds', async () => {
    const db = buildMockDb({
      pools: [makePool({ chainId: 1, updatedAt: 100n })],
      ticks: [],
      chainStatus: [],
    });
    const metrics = createMetrics();
    const lags: Array<{ name: string; lag: number }> = [];

    const monitor = startIndexerLagMonitor({
      db,
      metrics,
      chains: [{ chainId: 1, name: 'mainnet', blockTimeSec: 12 }],
      fetchTipBlock: async () => 110n,
      onLag: (_chainId, name, lagSeconds) => lags.push({ name, lag: lagSeconds }),
      setIntervalImpl: FAKE_INTERVAL,
    });

    await monitor.pollOnce();

    expect(lags).toEqual([{ name: 'mainnet', lag: 120 }]);
    monitor.stop();
  });
});
