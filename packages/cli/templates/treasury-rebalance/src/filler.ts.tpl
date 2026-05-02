/**
 * {{projectName}} — Treasury Rebalance Filler.
 *
 * The hero example: a DAO whose only solver is itself. Every rebalance
 * intent the treasury submits gets filled by THIS solver — keeping the
 * spread inside the DAO instead of paying it to an external aggregator.
 *
 * Two modes (driven by `DEMO_MODE` in `.env`):
 *
 *   - production (default): `createFillerFromPrivateKey` + `subscribeIntents`.
 *     Filler tails the Reactor; treasury submits intents from the DAO Safe;
 *     this solver fills them via the standard `prepare → submit` loop.
 *
 *   - demo (`DEMO_MODE=true`): use `createMockFiller` from
 *     `@filler-sdk/sdk/testing` + `SyntheticIntentGenerator`. Synthetic
 *     intents flow through the same `handleFill` logic; the dashboard's
 *     "spread captured" counter ticks live without on-chain state. Useful
 *     for the hackathon demo recording + local development without a chain.
 *
 * Both modes wire the same `DashboardEmitter` for SSE broadcasting on
 * `DASHBOARD_PORT/events`.
 */

import {
  createDefaultLogger,
  createFillerFromPrivateKey,
  type Filler,
  type FillResult,
  type Intent,
} from '@filler-sdk/sdk';
import { createMockFiller, mockFillResult } from '@filler-sdk/sdk/testing';

import { loadConfig } from './config';
import { createDashboardEmitter } from './dashboardEmitter';
import { createTreasuryStrategy } from './strategy';
import { createSyntheticIntentGenerator } from './syntheticIntents';
import { loadTreasuryConfig } from './treasury';

const config = loadConfig();
const treasury = loadTreasuryConfig();
const log = createDefaultLogger({
  level: config.LOG_LEVEL,
  bindings: {
    project: '{{projectName}}',
    vertical: 'treasury-rebalance',
    mode: treasury.DEMO_MODE ? 'demo' : 'production',
  },
});

const strategy = createTreasuryStrategy(treasury.TREASURY_ADDRESS as `0x${string}`);
const dashboard = createDashboardEmitter(treasury.DASHBOARD_PORT);

// === Filler construction — branch on DEMO_MODE =========================

let filler: Filler;

if (treasury.DEMO_MODE) {
  // Mock filler — accepts synthetic intents + returns mock FillResults.
  // Sprint 03 Plan 09's `@filler-sdk/sdk/testing` was designed for exactly
  // this use case (demos + tests without on-chain access).
  filler = createMockFiller({
    // `createMockFiller`'s `overrides` param has a default value (`= {}`), so
    // `Parameters<...>[0]` widens to `Overrides | undefined` — index `chainId`
    // off the un-defaulted production factory instead, since it's the same type.
    chainId: config.CHAIN_ID as Parameters<typeof createFillerFromPrivateKey>[0]['chainId'],
    account: treasury.TREASURY_ADDRESS as `0x${string}`,
  });
  log.info({}, '[{{projectName}}] DEMO MODE — using MockFiller; no chain access');
} else {
  filler = createFillerFromPrivateKey({
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
      account: filler.account,
      treasury: treasury.TREASURY_ADDRESS,
      indexer: config.INDEXER_URL,
    },
    '[{{projectName}}] PRODUCTION MODE — solver online',
  );
}

// === Fill handler — same logic for demo + production ===================

async function handleFill(intent: Intent): Promise<void> {
  const child = log.child?.({ orderHash: intent.orderHash }) ?? log;
  child.debug?.({ swapper: intent.swapper }, 'treasury intent received');

  // Strategy filter — accept only DAO-treasury intents. (Production
  // subscribes with this filter applied at the SDK boundary; demo mode's
  // generator only emits treasury intents, but we double-check for safety.)
  if (!strategy.filter(intent)) {
    child.debug?.({ swapper: intent.swapper }, 'not a treasury intent — skipping');
    return;
  }

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
  if (!strategy.decide(intent, params)) {
    child.debug?.({}, 'strategy rejected');
    return;
  }

  let result: FillResult;
  try {
    if (treasury.DEMO_MODE) {
      // In demo mode, the MockFiller's submitFill returns a canned result.
      // We override it with our synthetic-realistic spread so the dashboard
      // counter ticks credibly.
      result = mockFillResult({
        intent,
        params,
        feeCapturedAmount: estimateSyntheticSpread(intent, params),
        blockNumber: intent.observedAt,
      });
    } else {
      result = await filler.submitFill(intent, params, {
        gasMultiplier: 1.2,{{#if useKeeperHub}}
        useKeeperHub: true,{{/if}}
      });
    }
  } catch (err) {
    child.error?.({ err: errMsg(err) }, '✗ fill failed');
    return;
  }

  const spreadUSD = Number(result.feeCapturedAmount) / 1_000_000;
  dashboard.emitSpreadCaptured(intent, params, result, spreadUSD);

  child.info?.(
    {
      txHash: result.txHash,
      blockNumber: result.blockNumber.toString(),
      spreadUSD,
      totalUSD: dashboard.totalUSD,
      mode: treasury.DEMO_MODE ? 'demo' : 'production',
    },
    '✓ spread internalised',
  );
}

// === Wire input source ==================================================

let stopGenerator: (() => void) | undefined;
let unsubscribeIntents: (() => void) | undefined;

void dashboard.start().then(() => {
  log.info(
    {
      port: treasury.DASHBOARD_PORT,
      url: `http://localhost:${treasury.DASHBOARD_PORT}/events`,
    },
    '[{{projectName}}] dashboard SSE listening',
  );
});

if (treasury.DEMO_MODE) {
  const generator = createSyntheticIntentGenerator(
    treasury,
    config.REACTOR_ADDRESS as `0x${string}`,
  );
  generator.on('intent', (intent) => {
    void handleFill(intent);
  });
  generator.start();
  stopGenerator = () => generator.stop();
  log.info(
    {
      intervalSec: treasury.DEMO_INTERVAL_SEC,
      tokens: [...treasury.TOKEN_ADDRESSES.keys()],
    },
    '[{{projectName}}] synthetic intent generator started',
  );
} else {
  unsubscribeIntents = filler.subscribeIntents(
    { reactors: [config.REACTOR_ADDRESS as `0x${string}`] },
    handleFill,
  );
}

// === Graceful shutdown =================================================

const shutdown = async (signal: string): Promise<void> => {
  log.info({ signal }, '[{{projectName}}] shutting down');
  stopGenerator?.();
  unsubscribeIntents?.();
  await dashboard.stop();
  await filler.shutdown();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

// === Helpers ===========================================================

/**
 * Synthetic spread — for demo mode only. Returns a value in the output
 * token's smallest unit (USDC 6-decimal convention) so the dashboard's
 * USD-denominated counter renders credibly.
 *
 *   spread ≈ 0.05% – 0.30% of input (typical aggregator markup).
 */
function estimateSyntheticSpread(
  intent: Intent,
  _params: unknown,
): bigint {
  const inputAmount = intent.input.amount;
  // 5–30 bps of input, USDC-denominated.
  const bps = BigInt(5 + Math.floor(Math.random() * 25));
  return (inputAmount * bps) / 10_000n;
}

function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
