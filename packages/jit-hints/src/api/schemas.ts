import { z } from 'zod';

/** poolId is the v4 keccak256 of the PoolKey — a 32-byte hex string. */
const PoolId = z
  .string()
  .regex(/^0x[a-fA-F0-9]{64}$/, 'pool must be a 0x-prefixed 32-byte hex string');

/** EVM addresses are 20 bytes. */
const Address = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'token must be a 0x-prefixed 20-byte hex address');

const BigIntString = z.string().refine(
  (s) => {
    try {
      const n = BigInt(s);
      return n >= 0n;
    } catch {
      return false;
    }
  },
  { message: 'must be a non-negative integer string' },
);

const BoolString = z
  .string()
  .transform((s) => s.toLowerCase())
  .pipe(z.enum(['true', 'false']))
  .transform((s) => s === 'true');

export const DepthQuerySchema = z.object({
  pool: PoolId,
  size: BigIntString,
  zeroForOne: BoolString,
  slippageBps: z.coerce.number().int().min(1).max(10_000).default(50),
  gasPriceWei: BigIntString.optional(),
  gasOverhead: BigIntString.optional(),
});

export type DepthQueryInput = z.infer<typeof DepthQuerySchema>;

export const PoolListSchema = z.object({
  chain: z.coerce.number().int().min(1).optional(),
  token: Address.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type PoolListInput = z.infer<typeof PoolListSchema>;

export const PoolIdParamSchema = z.object({
  id: PoolId,
});
