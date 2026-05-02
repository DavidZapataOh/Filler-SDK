/**
 * Treasury config — Zod-validated DAO/treasury-side knobs.
 *
 * Separated from `config.ts` so it's clear which env vars are TREASURY-flow
 * (TARGET_ALLOCATIONS, REBALANCE_SCHEDULE) versus filler-flow (RPC_URL,
 * private key, contract addresses). Both load from the same `process.env`.
 */

import type { Address } from 'viem';
import { z } from 'zod';

const AddressString = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, '0x-prefixed 20-byte hex required');

const TreasuryConfigSchema = z.object({
  TREASURY_ADDRESS: AddressString,

  REBALANCE_SCHEDULE: z
    .enum(['weekly', 'monthly', 'quarterly'])
    .default('quarterly'),

  TARGET_ALLOCATIONS: z
    .string()
    .default('{"ETH":60,"USDC":40}')
    .transform((s, ctx) => {
      try {
        const obj = JSON.parse(s) as Record<string, unknown>;
        const entries = Object.entries(obj).map(([token, pct]) => {
          const n = typeof pct === 'number' ? pct : Number(pct);
          if (!Number.isFinite(n) || n < 0 || n > 100) {
            ctx.addIssue({
              code: 'custom',
              message: `${token}: percentage must be a number in [0, 100]`,
            });
            return { token: token.toUpperCase(), percentage: 0 };
          }
          return { token: token.toUpperCase(), percentage: n };
        });
        const sum = entries.reduce((acc, e) => acc + e.percentage, 0);
        if (Math.abs(sum - 100) > 0.01) {
          ctx.addIssue({
            code: 'custom',
            message: `TARGET_ALLOCATIONS percentages must sum to 100 (got ${sum})`,
          });
        }
        return entries;
      } catch (err) {
        ctx.addIssue({
          code: 'custom',
          message: `invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
        });
        return [] as { token: string; percentage: number }[];
      }
    }),

  TOKEN_ADDRESSES: z
    .string()
    .default('{}')
    .transform((s, ctx) => {
      try {
        const obj = JSON.parse(s) as Record<string, string>;
        const map = new Map<string, Address>();
        for (const [k, v] of Object.entries(obj)) {
          if (!/^0x[a-fA-F0-9]{40}$/.test(v)) {
            ctx.addIssue({
              code: 'custom',
              message: `TOKEN_ADDRESSES.${k}: must be 0x-prefixed 20-byte hex`,
            });
            continue;
          }
          map.set(k.toUpperCase(), v.toLowerCase() as Address);
        }
        return map;
      } catch (err) {
        ctx.addIssue({
          code: 'custom',
          message: `TOKEN_ADDRESSES: invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
        });
        return new Map<string, Address>();
      }
    }),

  MIN_REBALANCE_USD: z.coerce.number().nonnegative().default(10_000),

  // NOTE: z.coerce.boolean() is a footgun — any non-empty string (including
  // "false") coerces to true. Use a strict string match. See FEEDBACK F-63.
  DEMO_MODE: z
    .string()
    .default('false')
    .transform((s) => s.toLowerCase() === 'true' || s === '1'),
  DEMO_INTERVAL_SEC: z.coerce.number().int().positive().default(10),
  DASHBOARD_PORT: z.coerce.number().int().min(1).max(65535).default(8080),
});

export type TreasuryConfig = z.infer<typeof TreasuryConfigSchema>;

export function loadTreasuryConfig(): TreasuryConfig {
  const result = TreasuryConfigSchema.safeParse(process.env);
  if (!result.success) {
    console.error('[treasury-rebalance] invalid TREASURY config:');
    for (const issue of result.error.issues) {
      console.error(`  - ${issue.path.join('.') || '(root)'}: ${issue.message}`);
    }
    console.error('\nSee `.env.example`. Treasury config is separate from filler config (see `config.ts`).');
    process.exit(1);
  }
  return result.data;
}
