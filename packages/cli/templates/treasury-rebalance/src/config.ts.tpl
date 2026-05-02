/**
 * Filler-side config — Zod-validated env. Treasury-side config is in
 * `treasury.ts` (separated for readability + testability).
 *
 * In `DEMO_MODE=true` only a subset of fields is required (no SOLVER_PRIVATE_KEY
 * needed; mock filler doesn't broadcast). The schema keeps everything optional
 * with sensible defaults for demo runs; the production `createFillerFromPrivateKey`
 * call in `filler.ts` enforces required fields at construction time.
 */

import { isSupportedChainId } from '@filler-sdk/sdk';
import { z } from 'zod';

const Address = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, '0x-prefixed 20-byte hex required');

const HttpsUrl = z
  .string()
  .url()
  .refine(
    (u) =>
      /^https:\/\//.test(u) ||
      /^http:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?(?:\/.*)?$/.test(u),
    'must be https:// (http:// only allowed for localhost / 127.0.0.1)',
  );

const ConfigSchema = z.object({
  // Solver identity — only required in production mode.
  SOLVER_PRIVATE_KEY: z
    .string()
    .regex(/^0x[a-fA-F0-9]{64}$/, '0x-prefixed 32-byte hex required')
    .default('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'), // anvil[0] for demo mode

  // Network
  CHAIN_ID: z.coerce
    .number()
    .int()
    .refine(isSupportedChainId, 'unsupported chainId; see @filler-sdk/sdk')
    .default(130),
  RPC_URL: HttpsUrl.default('https://unichain.publicnode.com'),

  // Deployed contract addresses — required for production; demo mode uses
  // placeholder defaults so the mock filler can construct.
  FILLER_ADDRESS: Address.default('0x0000000000000000000000000000000000000001'),
  BOND_ADDRESS: Address.default('0x0000000000000000000000000000000000000002'),
  REACTOR_ADDRESS: Address.default('0x0000000000000000000000000000000000000003'),
  POOL_MANAGER_ADDRESS: Address.default(
    '0x1f98400000000000000000000000000000000004',
  ),

  // Indexer
  INDEXER_URL: HttpsUrl.default('http://localhost:42069'),

  // Strategy
  MIN_PROFIT_USD: z.coerce.number().nonnegative().default(0),

  // Logging
  LOG_LEVEL: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
    .default('info'),

  // KeeperHub — runtime-required when useKeeperHub:true is wired into the
  // SDK; SDK validates non-empty apiKey at construction.
  KEEPERHUB_API_KEY: z.string().optional(),
  KEEPERHUB_BASE_URL: HttpsUrl.optional(),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(): Config {
  const result = ConfigSchema.safeParse(process.env);
  if (!result.success) {
    console.error('[{{projectName}}] invalid configuration:');
    for (const issue of result.error.issues) {
      console.error(`  - ${issue.path.join('.') || '(root)'}: ${issue.message}`);
    }
    console.error('\nSee `.env.example`. Copy to `.env` and fill the missing fields.');
    process.exit(1);
  }
  return result.data;
}
