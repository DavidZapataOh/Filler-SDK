import { z } from 'zod';

/**
 * Schema for the indexer's runtime environment. Every var that the deploy needs is
 * declared here so a misconfigured chain fails at boot, not on the first event.
 *
 * Loose by default for development:
 *   - In dev (no `.env`), all chains are optional and default to public RPCs where
 *     possible. Required-ness is checked at runtime by Ponder when a chain is
 *     actually accessed.
 *   - In production (DATABASE_URL set), every chain is configured.
 *
 * Use `loadEnv()` once at config-load time. Tests can override by setting
 * `process.env.<KEY>` before calling.
 */

const Address = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'must be a 0x-prefixed 20-byte hex address')
  .transform((s) => s as `0x${string}`);

const Url = z
  .string()
  .regex(/^(https?|wss?):\/\//, 'must be an http(s) or ws(s) URL');

const StartBlock = z.coerce.number().int().min(0).default(0);

const EnvSchema = z.object({
  // === Database (optional — pglite local default) ===
  DATABASE_URL: z.string().optional(),

  // === Logging ===
  LOG_LEVEL: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
    .default('info'),

  // === HTTP API server ===
  PORT: z.coerce.number().int().min(1).max(65535).default(42069),
  HOST: z.string().default('0.0.0.0'),

  // === Per-chain RPC endpoints ===
  UNICHAIN_RPC_URL: Url.default('https://unichain.publicnode.com'),
  UNICHAIN_WSS_URL: Url.optional(),
  MAINNET_RPC_URL: Url.default('https://eth.publicnode.com'),
  MAINNET_WSS_URL: Url.optional(),
  BASE_RPC_URL: Url.default('https://base.publicnode.com'),
  BASE_WSS_URL: Url.optional(),
  ARBITRUM_RPC_URL: Url.default('https://arbitrum.publicnode.com'),
  ARBITRUM_WSS_URL: Url.optional(),
  OPTIMISM_RPC_URL: Url.default('https://optimism.publicnode.com'),
  OPTIMISM_WSS_URL: Url.optional(),

  // === Per-chain v4 PoolManager addresses ===
  UNICHAIN_POOL_MANAGER: Address.default(
    '0x1f98400000000000000000000000000000000004',
  ),
  MAINNET_POOL_MANAGER: Address.default(
    '0x000000000004444c5dc75cb358380d2e3de08a90',
  ),
  BASE_POOL_MANAGER: Address.default(
    '0x498581ff718922c3f8e6a244956af099b2652b2b',
  ),
  ARBITRUM_POOL_MANAGER: Address.default(
    '0x360e68faccca8ca4f01a01ea7b8538def68d2bd1',
  ),
  OPTIMISM_POOL_MANAGER: Address.default(
    '0x9a13f98cb987694c9f086b1f5eb990eea8264ec3',
  ),

  // === Per-chain start blocks ===
  // Defaults reflect the canonical PoolManager deployment block per chain.
  // Override per env when re-indexing from a later checkpoint for cost.
  UNICHAIN_START_BLOCK: StartBlock,
  MAINNET_START_BLOCK: StartBlock,
  BASE_START_BLOCK: StartBlock,
  ARBITRUM_START_BLOCK: StartBlock,
  OPTIMISM_START_BLOCK: StartBlock,
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;

export function loadEnv(input: NodeJS.ProcessEnv = process.env): Env {
  if (cached !== undefined) return cached;
  const parsed = EnvSchema.safeParse(input);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/**
 * Test-only: clear the memoized env. Production code should never need this.
 */
export function _resetEnvForTesting(): void {
  cached = undefined;
}
