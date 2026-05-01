import type { JitHintsDb } from '../api/db';
import type { JitHintsMetrics } from '../api/metrics';

/**
 * Periodic per-chain monitor that compares the chain tip block to the latest
 * indexed block and records the gap (in seconds) into the indexer-lag
 * histogram. Also keeps `indexedPools{chainId}` fresh.
 *
 * Operators wire the callback `fetchTipBlock(chainId)` to whichever client
 * library they prefer (viem, ethers, an internal RPC pool). The monitor stays
 * agnostic — it just multiplies block lag by the per-chain block-time hint to
 * get a seconds estimate.
 *
 * Usage:
 *   const monitor = startIndexerLagMonitor({
 *     db,
 *     metrics,
 *     chains: [
 *       { chainId: 1, name: 'mainnet', blockTimeSec: 12 },
 *       { chainId: 130, name: 'unichain', blockTimeSec: 1 },
 *     ],
 *     intervalMs: 30_000,
 *     fetchTipBlock: async (chainId) => publicClients[chainId].getBlockNumber(),
 *   });
 *   // ...
 *   monitor.stop();   // graceful shutdown
 */
export interface ChainLagConfig {
  chainId: number;
  /** Display name; logged on errors. */
  name: string;
  /** Average block time in seconds. Lag in seconds = blockLag × blockTimeSec. */
  blockTimeSec: number;
}

export interface IndexerLagMonitorOptions {
  db: JitHintsDb;
  metrics: JitHintsMetrics;
  chains: ChainLagConfig[];
  /** Polling interval. Defaults to 30 s. */
  intervalMs?: number;
  /**
   * Returns the current chain-tip block. Async because it almost always hits
   * an RPC. Throws are caught and logged.
   */
  fetchTipBlock: (chainId: number) => Promise<bigint>;
  /**
   * Optional logger hook. Defaults to a no-op so tests don't need a real pino.
   */
  onError?: (chainId: number, name: string, err: unknown) => void;
  onLag?: (chainId: number, name: string, lagSeconds: number) => void;
  /** Test-only injectable clock. */
  setIntervalImpl?: (cb: () => void, ms: number) => { unref?(): void };
}

export interface IndexerLagMonitor {
  /** Stop the timer. Idempotent. */
  stop(): void;
  /** Manually trigger one observation cycle. Useful for tests. */
  pollOnce(): Promise<void>;
}

const DEFAULT_INTERVAL_MS = 30_000;

export function startIndexerLagMonitor(opts: IndexerLagMonitorOptions): IndexerLagMonitor {
  const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS;
  const setIntervalImpl =
    opts.setIntervalImpl ??
    ((cb, ms) => {
      const t = setInterval(cb, ms);
      return { unref: () => t.unref?.() };
    });

  const pollOnce = async (): Promise<void> => {
    for (const chain of opts.chains) {
      try {
        const [tipBlock, indexedBlock, poolCount] = await Promise.all([
          opts.fetchTipBlock(chain.chainId),
          opts.db.lastIndexedBlock(chain.chainId),
          opts.db.countPools(chain.chainId),
        ]);

        opts.metrics.indexedPools.set({ chainId: String(chain.chainId) }, poolCount);

        if (indexedBlock === null) {
          // No pool rows yet — nothing meaningful to compute. Skip.
          continue;
        }

        const blockLag = tipBlock > indexedBlock ? Number(tipBlock - indexedBlock) : 0;
        const lagSeconds = blockLag * chain.blockTimeSec;
        opts.metrics.indexerLagSeconds.observe(
          { chainId: String(chain.chainId) },
          lagSeconds,
        );
        opts.onLag?.(chain.chainId, chain.name, lagSeconds);
      } catch (err) {
        opts.onError?.(chain.chainId, chain.name, err);
      }
    }
  };

  const handle = setIntervalImpl(() => {
    void pollOnce();
  }, intervalMs);
  handle.unref?.();

  return {
    stop() {
      // Both setInterval and our test-injected impl support being cleared via
      // standard `clearInterval` — node setInterval handles, opaque to TS;
      // test impls return a fake handle that ignores stop calls.
      // We keep this idempotent by not throwing if the impl doesn't support it.
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        clearInterval(handle as any);
      } catch {
        // ignore — test impls may not be clearable, that's fine
      }
    },
    pollOnce,
  };
}
