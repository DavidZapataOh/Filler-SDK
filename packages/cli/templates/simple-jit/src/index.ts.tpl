/**
 * {{projectName}} — Simple JIT Filler
 *
 * Subscribes to UniswapX intents on {{chain}}, queries the JIT-hints indexer
 * for the best v4 pool + depth hint, and fills profitable intents.
 *
 * **Stub from create-filler.** Plan 03 of Sprint 04 (Reference Solvers) will
 * fill this with the production solver loop. Today the file shows the wiring
 * shape: every TODO marks where Plan 03 fills the body.
 */

import {
  createFillerFromPrivateKey,
  type Filler,
  type Intent,
} from '@filler-sdk/sdk';

const env = loadEnv();

const filler: Filler = createFillerFromPrivateKey({
  chainId: getChainId('{{chain}}'),
  privateKey: env.SOLVER_PRIVATE_KEY as `0x${string}`,
  rpcUrl: env.RPC_URL,
  indexer: { baseUrl: env.INDEXER_URL },{{#if useKeeperHub}}
  keeperHub: {
    baseUrl: env.KEEPERHUB_BASE_URL,
    apiKey: env.KEEPERHUB_API_KEY,
  },{{/if}}
});

console.log(
  `[{{projectName}}] solver online on {{chain}} as`,
  filler.account,
);

// Subscribe to intents matching our criteria. Plan 03 plugs in real filters.
const unsubscribe = filler.subscribeIntents({}, async (intent: Intent) => {
  // TODO (Plan 03): apply your strategy filter here.
  console.log('[{{projectName}}] intent', intent.orderHash);

  // TODO (Plan 03): prepare → simulate → submit loop.
  //   const params = await filler.prepareFill(intent);
  //   if (params === null) return; // not fillable
  //   const result = await filler.submitFill(intent, params{{#if useKeeperHub}}, { useKeeperHub: true }{{/if}});
  //   console.log('filled', result.txHash);
});

// Graceful shutdown: drain subscriptions on SIGTERM / SIGINT.
const shutdown = async (signal: string): Promise<void> => {
  console.log(`[{{projectName}}] shutting down (${signal})`);
  unsubscribe();
  await filler.shutdown();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

// === helpers ============================================================

function loadEnv(): Record<string, string> {
  const required = ['SOLVER_PRIVATE_KEY', 'RPC_URL'];
  const missing = required.filter((k) => process.env[k] === undefined);
  if (missing.length > 0) {
    console.error(
      `[{{projectName}}] missing required env: ${missing.join(', ')}`,
    );
    process.exit(1);
  }
  return process.env as Record<string, string>;
}

function getChainId(chain: string): 1 | 130 | 8453 | 42161 | 10 | 11155111 | 11155420 | 31337 {
  const map = {
    mainnet: 1,
    unichain: 130,
    base: 8453,
    arbitrum: 42161,
    optimism: 10,
    sepolia: 11155111,
    unichainSepolia: 11155420,
    foundry: 31337,
  } as const;
  const id = map[chain as keyof typeof map];
  if (id === undefined) throw new Error(`unsupported chain: ${chain}`);
  return id;
}
