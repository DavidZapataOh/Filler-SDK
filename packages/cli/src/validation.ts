/**
 * Pure validators + enum tables for the CLI. Anything that doesn't need a
 * spawned process or interactive prompt lives here so unit tests run
 * in-process at sub-millisecond speed.
 *
 * The validation rules are intentionally strict — `npm` package-name rules
 * are looser (allow `@scope/name`, dots, capitals), but a `create-filler`
 * project name is a directory name first + an npm name second, and most
 * solvers don't publish their solver as an npm package. Lowercase-alphanumeric-
 * with-hyphens is the conservative shape that works on every filesystem
 * (including Windows + ZFS) and as an npm name.
 */

import { z } from 'zod';

import type { ChainName } from './types';

// === Project name ========================================================

export const ProjectNameSchema = z
  .string()
  .min(1, 'Project name is required')
  .max(100, 'Project name must be at most 100 characters')
  .regex(
    /^[a-z][a-z0-9-]*$/,
    'Use lowercase letters, numbers, hyphens (must start with a letter)',
  )
  .refine((name) => !name.endsWith('-'), {
    message: 'Project name must not end with a hyphen',
  })
  .refine((name) => !/--/.test(name), {
    message: 'Project name must not contain consecutive hyphens',
  });

export type ProjectName = z.infer<typeof ProjectNameSchema>;

// === Vertical templates ==================================================

export interface VerticalSpec {
  value: VerticalKey;
  label: string;
  hint: string;
  /**
   * `false` = template not yet shipped. Plan 02 lands the real templates;
   * Plan 01 ships scaffold for `simple-jit` only.
   */
  available: boolean;
}

export type VerticalKey =
  | 'simple-jit'
  | 'lvr-aware'
  | 'treasury-rebalance'
  | 'custom';

export const VERTICALS: readonly VerticalSpec[] = [
  {
    value: 'simple-jit',
    label: 'Simple JIT Filler',
    hint: 'Entry point — recommended for first-time builders',
    available: true,
  },
  {
    value: 'lvr-aware',
    label: 'LVR-Aware Filler',
    hint: 'Advanced — only fills LP-favourable swaps, prom-client metrics',
    available: true,
  },
  {
    value: 'treasury-rebalance',
    label: 'Treasury Rebalance Filler',
    hint: 'HERO — DAO internalization, synthetic intents + SSE dashboard',
    available: true,
  },
  {
    value: 'custom',
    label: 'Custom (empty starter)',
    hint: 'Bare scaffold — fill it in yourself',
    available: true,
  },
] as const;

export const VERTICAL_VALUES: readonly VerticalKey[] = VERTICALS.map(
  (v) => v.value,
);

export function isVerticalKey(value: string): value is VerticalKey {
  return (VERTICAL_VALUES as readonly string[]).includes(value);
}

export function getVertical(key: VerticalKey): VerticalSpec {
  const v = VERTICALS.find((entry) => entry.value === key);
  if (v === undefined) {
    throw new Error(`unknown vertical: ${key}`);
  }
  return v;
}

// === Chains (matches @filler-sdk/sdk's `ChainName`) =====================
//
// Mirrors the chain registry from `packages/sdk/src/chains.ts`. Kept as a
// literal here so the CLI doesn't have to import the SDK at parse time
// (faster startup; the SDK's public surface lands in the templates anyway).

export interface ChainSpec {
  value: ChainName;
  label: string;
  testnet: boolean;
}

export const CHAINS: readonly ChainSpec[] = [
  { value: 'unichain', label: 'Unichain (recommended)', testnet: false },
  { value: 'mainnet', label: 'Ethereum Mainnet', testnet: false },
  { value: 'arbitrum', label: 'Arbitrum One', testnet: false },
  { value: 'base', label: 'Base', testnet: false },
  { value: 'optimism', label: 'OP Mainnet', testnet: false },
  { value: 'sepolia', label: 'Sepolia (testnet)', testnet: true },
  { value: 'unichainSepolia', label: 'Unichain Sepolia (testnet)', testnet: true },
  { value: 'foundry', label: 'Anvil / Foundry (local 31337)', testnet: true },
] as const;

export const CHAIN_VALUES: readonly ChainName[] = CHAINS.map((c) => c.value);

export function isChainName(value: string): value is ChainName {
  return (CHAIN_VALUES as readonly string[]).includes(value);
}

export function getChain(name: ChainName): ChainSpec {
  const c = CHAINS.find((entry) => entry.value === name);
  if (c === undefined) {
    throw new Error(`unknown chain: ${name}`);
  }
  return c;
}

// === Indexer URL ========================================================

export const IndexerUrlSchema = z
  .string()
  .url()
  .refine(
    (url) =>
      /^https:\/\//.test(url) ||
      /^http:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?(?:\/.*)?$/.test(
        url,
      ),
    {
      message:
        'indexerUrl must be https:// (http:// only allowed for localhost / 127.0.0.1)',
    },
  );

/** Default indexer URL — matches the jit-hints HTTP API port (Plan 09 Sprint 02). */
export const DEFAULT_INDEXER_URL = 'http://localhost:42069' as const;

// === Combined config validator ==========================================

export const CliConfigSchema = z
  .object({
    projectName: ProjectNameSchema,
    vertical: z.enum(VERTICAL_VALUES as [VerticalKey, ...VerticalKey[]]),
    chain: z.enum(CHAIN_VALUES as [ChainName, ...ChainName[]]),
    indexerUrl: IndexerUrlSchema,
    useKeeperHub: z.boolean(),
    initGit: z.boolean(),
    install: z.boolean(),
  })
  .strict();

export type CliConfig = z.infer<typeof CliConfigSchema>;
