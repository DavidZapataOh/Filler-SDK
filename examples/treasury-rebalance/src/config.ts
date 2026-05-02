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
  SOLVER_PRIVATE_KEY: z
    .string()
    .regex(/^0x[a-fA-F0-9]{64}$/, '0x-prefixed 32-byte hex required')
    .default('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'),

  CHAIN_ID: z.coerce
    .number()
    .int()
    .refine(isSupportedChainId, 'unsupported chainId; see @filler-sdk/sdk')
    .default(31_337),
  RPC_URL: HttpsUrl.default('http://localhost:8545'),

  FILLER_ADDRESS: Address.default('0xC489d11D03B2999A6ba568e02E0b95eFc58b6A34'),
  BOND_ADDRESS: Address.default('0x559Bb2F2beb43246bA63057F3750b742b92dBBf9'),
  REACTOR_ADDRESS: Address.default('0x00000011f84b9aa48e5f8aa8b9897600006289be'),
  POOL_MANAGER_ADDRESS: Address.default(
    '0x000000000004444c5dc75cb358380d2e3de08a90',
  ),

  INDEXER_URL: HttpsUrl.default('http://localhost:42069'),

  MIN_PROFIT_USD: z.coerce.number().nonnegative().default(0),

  LOG_LEVEL: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
    .default('info'),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(): Config {
  const result = ConfigSchema.safeParse(process.env);
  if (!result.success) {
    console.error('[treasury-rebalance] invalid configuration:');
    for (const issue of result.error.issues) {
      console.error(`  - ${issue.path.join('.') || '(root)'}: ${issue.message}`);
    }
    console.error('\nSee `.env.example`. Copy to `.env` and fill the missing fields.');
    process.exit(1);
  }
  return result.data;
}
