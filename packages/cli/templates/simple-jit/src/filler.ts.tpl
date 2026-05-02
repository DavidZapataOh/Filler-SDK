/**
 * {{projectName}} — Simple JIT Filler main loop.
 *
 *   1. Load + validate `.env` (`config.ts`).
 *   2. Build a `Filler` via `createFillerFromPrivateKey`.
 *   3. Subscribe via `strategy.filter` (saves indexer queries).
 *   4. Per intent: prepareFill → strategy.decide → submitFill.
 *   5. Graceful SIGTERM / SIGINT shutdown.
 */

import {
  createDefaultLogger,
  createFillerFromPrivateKey,
  type FillResult,
  type Intent,
} from '@filler-sdk/sdk';

import { loadConfig } from './config';
import { strategy } from './strategy';

const config = loadConfig();
const log = createDefaultLogger({
  level: config.LOG_LEVEL,
  bindings: { project: '{{projectName}}', vertical: 'simple-jit' },
});

// MIN_PROFIT_USD is in USD; SDK's expectedFeeCapture is the output token's
// smallest unit. v0 assumes USDC (6 decimals); customise for non-USDC outputs.
const minProfitWei = BigInt(Math.floor(config.MIN_PROFIT_USD * 1_000_000));

const filler = createFillerFromPrivateKey({
  chainId: config.CHAIN_ID as Parameters<typeof createFillerFromPrivateKey>[0]['chainId'],
  privateKey: config.SOLVER_PRIVATE_KEY as `0x${string}`,
  rpcUrl: config.RPC_URL,{{#if useKeeperHub}}
  keeperHub: {
    baseUrl: config.KEEPERHUB_BASE_URL ?? '',
    apiKey: config.KEEPERHUB_API_KEY ?? '',
  },{{/if}}
  addresses: {
    filler: config.FILLER_ADDRESS as `0x${string}`,
    fillerBond: config.BOND_ADDRESS as `0x${string}`,
    reactor: config.REACTOR_ADDRESS as `0x${string}`,
    poolManager: config.POOL_MANAGER_ADDRESS as `0x${string}`,
  },
  indexer: { baseUrl: config.INDEXER_URL },
  logger: log,
});

log.info(
  {
    chainId: config.CHAIN_ID,
    account: filler.account,
    indexerUrl: config.INDEXER_URL,{{#if useKeeperHub}}
    keeperHub: true,{{/if}}
  },
  '[{{projectName}}] solver online',
);

const unsubscribe = filler.subscribeIntents(strategy.filter, async (intent: Intent) => {
  const child = log.child?.({ orderHash: intent.orderHash }) ?? log;
  child.debug?.({}, 'intent received');

  let params;
  try {
    params = await filler.prepareFill(intent);
  } catch (err) {
    child.warn?.({ err: errMsg(err) }, 'prepareFill threw');
    return;
  }
  if (params === null) {
    child.debug?.({}, 'no fillable params');
    return;
  }
  if (!strategy.decide(intent, params, minProfitWei)) {
    child.debug?.({ feesCaptured: params.feesCaptured.toString() }, 'strategy rejected');
    return;
  }

  let result: FillResult;
  try {
    result = await filler.submitFill(intent, params, {
      gasMultiplier: 1.2,{{#if useKeeperHub}}
      useKeeperHub: true,{{/if}}
    });
  } catch (err) {
    child.error?.({ err: errMsg(err) }, '✗ fill failed');
    return;
  }
  child.info?.(
    {
      txHash: result.txHash,
      blockNumber: result.blockNumber.toString(),
      gasUsed: result.gasUsed.toString(),
      feeCapturedAmount: result.feeCapturedAmount.toString(),
    },
    '✓ fill submitted',
  );
});

const shutdown = async (signal: string): Promise<void> => {
  log.info({ signal }, '[{{projectName}}] shutting down');
  unsubscribe();
  await filler.shutdown();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
