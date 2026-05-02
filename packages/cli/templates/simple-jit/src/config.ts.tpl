/**
 * Config loader — Zod-validated environment.
 *
 * Misconfiguration fails at boot with a clear error message. Add new vars to
 * `ConfigSchema` with a Zod validator + reference as `config.YOUR_VAR`.
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
  // Solver identity
  SOLVER_PRIVATE_KEY: z
    .string()
    .regex(/^0x[a-fA-F0-9]{64}$/, '0x-prefixed 32-byte hex required'),

  // Network
  CHAIN_ID: z.coerce
    .number()
    .int()
    .refine(isSupportedChainId, 'unsupported chainId; see @filler-sdk/sdk'),
  RPC_URL: HttpsUrl,
  WS_RPC_URL: z
    .string()
    .url()
    .refine(
      (u) =>
        /^wss:\/\//.test(u) ||
        /^ws:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?(?:\/.*)?$/.test(u),
      'must be wss:// (ws:// only allowed for localhost / 127.0.0.1)',
    )
    .optional(),

  // Deployed contract addresses
  FILLER_ADDRESS: Address,
  BOND_ADDRESS: Address,
  REACTOR_ADDRESS: Address,
  POOL_MANAGER_ADDRESS: Address,

  // Indexer
  INDEXER_URL: HttpsUrl.default('http://localhost:42069'),

  // Strategy
  MIN_PROFIT_USD: z.coerce.number().nonnegative().default(1),

  // Logging
  LOG_LEVEL: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
    .default('info'),

  // KeeperHub — runtime-required when useKeeperHub:true is wired into the
  // SDK; the SDK itself rejects empty apiKey at construction. Optional here.
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
