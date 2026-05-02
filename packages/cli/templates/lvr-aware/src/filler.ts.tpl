/**
 * {{projectName}} — LVR-Aware Filler main loop.
 *
 *   1. Load + validate `.env`.
 *   2. Build a Filler via `createFillerFromPrivateKey`.
 *   3. Subscribe to intents; per-intent compute LVR analysis + decide.
 *   4. Only submit when JIT REDUCES LVR (filter LP-unfavorable swaps).
 *   5. Emit Prometheus metrics on `:METRICS_PORT/metrics`.
 *
 * **On-chain donation gap (v0)**: this template files filter-side LVR-favourable
 * fills + tracks "intended donation" via metrics. The actual `PoolManager.donate()`
 * call requires `Filler.sol` extension (donate inside `reactorCallback`'s
 * unlock context). Out of v0 scope; tracked in repo issues.
 */

import { createServer } from 'node:http';

import {
  createDefaultLogger,
  createFillerFromPrivateKey,
  type FillResult,
  type Intent,
} from '@filler-sdk/sdk';
import { Counter, Gauge, register } from 'prom-client';

import { loadConfig } from './config';
import type { LVRContext } from './lvr';
import { strategy } from './strategy';

const config = loadConfig();
const log = createDefaultLogger({
  level: config.LOG_LEVEL,
  bindings: { project: '{{projectName}}', vertical: 'lvr-aware' },
});

// MIN_PROFIT_USD denominated in output token's smallest unit (USDC convention).
const minProfitWei = BigInt(Math.floor(config.MIN_PROFIT_USD * 1_000_000));

const lvrContext: LVRContext = {
  volatilityBps: config.VOLATILITY_BPS,
  baseLiquidity: BigInt(config.BASE_LIQUIDITY_HINT),
  donationBps: config.DONATION_BPS,
};

// === Metrics ============================================================
//
// Exposed at `http://0.0.0.0:${METRICS_PORT}/metrics` in Prometheus format.
const lvrReductionTotal = new Counter({
  name: 'lvr_recaptured_total_wei',
  help: 'Cumulative LVR reduction across submitted fills (input-token wei)',
});
const intendedDonationTotal = new Counter({
  name: 'intended_donation_total_wei',
  help: 'Cumulative intended donation to LPs (output-token wei) — would-be value once on-chain donate ships',
});
const fillsSubmitted = new Counter({
  name: 'fills_submitted_total',
  help: 'Fills attempted by outcome',
  labelNames: ['result'],
});
const lastFillBlock = new Gauge({
  name: 'last_fill_block',
  help: 'Block number of the most recent successful fill',
});

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
    indexerUrl: config.INDEXER_URL,
    metricsPort: config.METRICS_PORT,
    volatilityBps: config.VOLATILITY_BPS,
    donationBps: config.DONATION_BPS,
  },
  '[{{projectName}}] LVR-aware solver online',
);

const unsubscribe = filler.subscribeIntents(strategy.filter, async (intent: Intent) => {
  const child = log.child?.({ orderHash: intent.orderHash }) ?? log;

  let params;
  try {
    params = await filler.prepareFill(intent);
  } catch (err) {
    child.warn?.({ err: errMsg(err) }, 'prepareFill threw');
    fillsSubmitted.inc({ result: 'prepare_failed' });
    return;
  }
  if (params === null) {
    child.debug?.({}, 'no fillable params');
    fillsSubmitted.inc({ result: 'no_params' });
    return;
  }

  const decision = await strategy.decide(intent, params, minProfitWei, lvrContext);
  if (!decision.submit) {
    child.debug?.(
      {
        reason: decision.expectedLVRReduction === 0n ? 'no_lvr_reduction' : 'unprofitable',
        expectedLVRReduction: decision.expectedLVRReduction.toString(),
      },
      'strategy rejected',
    );
    fillsSubmitted.inc({ result: 'strategy_rejected' });
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
    fillsSubmitted.inc({ result: 'submit_failed' });
    return;
  }

  // Update metrics + log structured success.
  lvrReductionTotal.inc(Number(decision.expectedLVRReduction));
  intendedDonationTotal.inc(Number(decision.intendedDonationWei));
  lastFillBlock.set(Number(result.blockNumber));
  fillsSubmitted.inc({ result: 'success' });

  child.info?.(
    {
      txHash: result.txHash,
      blockNumber: result.blockNumber.toString(),
      gasUsed: result.gasUsed.toString(),
      feeCapturedAmount: result.feeCapturedAmount.toString(),
      expectedLVRReduction: decision.expectedLVRReduction.toString(),
      intendedDonationWei: decision.intendedDonationWei.toString(),
    },
    '✓ LVR-aware fill submitted',
  );
});

// === Metrics HTTP endpoint =============================================

const metricsServer = createServer((req, res) => {
  if (req.url === '/metrics') {
    void register.metrics().then((m) => {
      res.writeHead(200, { 'content-type': register.contentType });
      res.end(m);
    });
    return;
  }
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', vertical: 'lvr-aware' }));
    return;
  }
  res.writeHead(404);
  res.end();
});
metricsServer.listen(config.METRICS_PORT, '0.0.0.0', () => {
  log.info({ port: config.METRICS_PORT }, '[{{projectName}}] metrics endpoint listening');
});

// === Graceful shutdown =================================================

const shutdown = async (signal: string): Promise<void> => {
  log.info({ signal }, '[{{projectName}}] shutting down');
  unsubscribe();
  metricsServer.close();
  await filler.shutdown();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
