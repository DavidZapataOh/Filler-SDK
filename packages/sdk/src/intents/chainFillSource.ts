/**
 * `chainFillIntentSource` — observational source. Tails the Reactor's `Fill`
 * event via viem's `watchContractEvent`; emits an Intent (with `'0x'`
 * sentinels for `rawOrder`/`signature`) for each fill.
 *
 * **Not a filling source.** See `parser.ts` JSDoc — Fill events are emitted
 * post-settle. Use `pollingIntentSource` (or a custom relayer-API source) to
 * find fillable open orders.
 *
 * Reconnect: viem's `watchContractEvent` handles WS / HTTP polling
 * reconnects internally. We attach an `onError` handler that logs + lets viem
 * retry. The stop fn calls viem's `unwatch` (which tears down the underlying
 * subscription).
 */

import type { Address, Log, PublicClient } from 'viem';

import type { ChainId } from '../chains';
import type { FillerLogger } from '../types';
import {
  decodeFillEvent,
  intentFromFillLog,
  reactorFillAbi,
} from './parser';
import {
  type IntentSink,
  type IntentSource,
  type IntentSourceStopFn,
} from './source';

export interface ChainFillIntentSourceConfig {
  /** viem `PublicClient` configured for the chain we're tailing. */
  publicClient: PublicClient;
  /** Reactor whose `Fill` events we tail. */
  reactorAddress: Address;
  /** Chain id — stamped onto every emitted Intent. */
  chainId: ChainId;
  /** Logger. */
  logger: FillerLogger;
  /**
   * Optional `fromBlock` for backfill. Useful for restart-resume scenarios.
   * Defaults to `'latest'` (no backfill).
   */
  fromBlock?: bigint;
}

export function createChainFillIntentSource(
  cfg: ChainFillIntentSourceConfig,
): IntentSource {
  const log = cfg.logger.child?.({ component: 'chainFillIntentSource' }) ?? cfg.logger;

  return {
    label: `chain-fill:${cfg.reactorAddress}`,

    start: (sink: IntentSink) => {
      const watchOpts: Parameters<PublicClient['watchContractEvent']>[0] = {
        abi: reactorFillAbi,
        address: cfg.reactorAddress,
        eventName: 'Fill',
        onLogs: async (logs: Log[]) => {
          for (const entry of logs) {
            try {
              const decoded = decodeFillEvent(entry);
              const intent = intentFromFillLog(
                entry,
                decoded,
                cfg.reactorAddress,
                cfg.chainId,
              );
              await sink.push(intent);
            } catch (err) {
              log.warn?.(
                { err: errorMessage(err), txHash: entry.transactionHash },
                'chainFillIntentSource: failed to decode Fill log',
              );
            }
          }
        },
        onError: (err) => {
          log.warn?.(
            { err: errorMessage(err), reactor: cfg.reactorAddress },
            'chainFillIntentSource: viem watch error — viem will retry internally',
          );
        },
      };
      if (cfg.fromBlock !== undefined) {
        watchOpts.fromBlock = cfg.fromBlock;
      }
      const unwatch = cfg.publicClient.watchContractEvent(watchOpts);

      const stop: IntentSourceStopFn = () => {
        unwatch();
      };
      return stop;
    },

    list: async () => {
      // Chain logs aren't a "current open intents" feed — observational only.
      return [];
    },
  };
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
