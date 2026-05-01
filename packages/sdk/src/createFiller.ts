/**
 * `createFiller` — the SDK's main entry point.
 *
 * This file lays down the public function signature + a runtime-validated
 * config resolver. The full implementation (wiring the IntentStream, FillEngine
 * and IndexerClient together) lands in Plan 02. Today the function:
 *
 *   1. Validates the user's `FillerConfig` with Zod.
 *   2. Builds the resolved config object.
 *   3. Throws `ConfigInvalidError` on bad input — the same error type Plan 02
 *      will use, so downstream test assertions written today still hold.
 *   4. Returns a typed `Filler` handle whose surfaces (`intents`, `fills`,
 *      `indexer`) reject with a "not yet implemented" error so any caller
 *      that hits the runtime sees a typed signal — never a silent no-op.
 *
 * The reason for shipping this surface in Plan 01: downstream packages
 * (`create-filler` CLI, the demo dashboard, examples) can author against the
 * exact public API today and get the right TypeScript types in their editor.
 * Plan 02 swaps the surface internals, not the signature.
 */

import { isAddress } from 'viem';
import { z } from 'zod';

import { getChainById, isSupportedChainId } from './chains';
import { ConfigInvalidError, FillerError } from './errors';
import { logger as defaultLogger } from './logger';
import type {
  Filler,
  FillerConfig,
  FillerLogger,
  IndexerConfig,
  ResolvedFillerConfig,
} from './types';

const DEFAULT_INDEXER_BASE_URL = 'https://hints.filler.xyz';
const DEFAULT_INDEXER_TIMEOUT_MS = 1500;

const AddressSchema = z
  .string()
  .refine(isAddress, { message: 'must be a 0x-prefixed 20-byte hex address' });

const TransportSchema = z.object({
  publicClient: z.unknown(),
  walletClient: z.unknown(),
});

const IndexerConfigSchema = z.object({
  baseUrl: z.string().url(),
  authToken: z.string().optional(),
  timeoutMs: z.number().int().positive().optional(),
});

const ChainIdSchema = z
  .number()
  .int()
  .refine(isSupportedChainId, {
    message: 'unsupported chainId; see chains registry',
  });

const FillerConfigSchema = z.object({
  chainId: ChainIdSchema,
  account: AddressSchema,
  transport: TransportSchema,
  indexer: IndexerConfigSchema.optional(),
  // Logger is structural; Zod can't validate methods cleanly, so we accept
  // anything and trust the structural type. Bad shape will fail at first call.
  logger: z.custom<FillerLogger>().optional(),
});

/**
 * Resolve a user-supplied `FillerConfig` into the SDK's internal
 * `ResolvedFillerConfig`. Pure — no I/O, no allocations beyond the result
 * object. Throws `ConfigInvalidError` with a Zod issue list on failure.
 */
export function resolveFillerConfig(input: FillerConfig): ResolvedFillerConfig {
  const parsed = FillerConfigSchema.safeParse(input);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new ConfigInvalidError(`invalid FillerConfig: ${issues}`, {
      context: { issues: parsed.error.issues },
    });
  }
  const config = parsed.data;
  // Defensive: getChainById asserts the id is supported. Already validated
  // by the zod schema, but the lookup catches drift in the registry.
  getChainById(config.chainId);

  const indexer: Required<IndexerConfig> = {
    baseUrl: config.indexer?.baseUrl ?? DEFAULT_INDEXER_BASE_URL,
    authToken: config.indexer?.authToken ?? '',
    timeoutMs: config.indexer?.timeoutMs ?? DEFAULT_INDEXER_TIMEOUT_MS,
  };

  return {
    chainId: config.chainId,
    account: config.account,
    transport: config.transport,
    indexer,
    logger: (config.logger ?? defaultLogger) as FillerLogger,
  };
}

/**
 * Build a `Filler` handle. Plan 01 returns a handle whose surfaces throw
 * `FillerError` with code `UNKNOWN` to make "not yet implemented" failures
 * loud. Plan 02 replaces those throwing surfaces with the real ones.
 */
export function createFiller(input: FillerConfig): Filler {
  const config = resolveFillerConfig(input);
  const log = config.logger;
  log.info(
    {
      chainId: config.chainId,
      account: config.account,
      indexer: config.indexer.baseUrl,
    },
    'createFiller: handle constructed (Plan 01 scaffold — full surfaces wired in Plan 02)',
  );

  const notImpl = (surface: string): never => {
    throw new FillerError(
      'UNKNOWN',
      `${surface} surface is wired in Plan 02. Plan 01 only ships the public types + config resolver.`,
    );
  };

  let shutdownCalled = false;
  return {
    chainId: config.chainId,
    account: config.account,
    config,
    intents: {
      subscribe: () => notImpl('intents.subscribe'),
      list: async () => notImpl('intents.list'),
    },
    fills: {
      execute: async () => notImpl('fills.execute'),
      simulate: async () => notImpl('fills.simulate'),
    },
    indexer: {
      depth: async () => notImpl('indexer.depth'),
      health: async () => notImpl('indexer.health'),
    },
    shutdown: async () => {
      if (shutdownCalled) return;
      shutdownCalled = true;
      log.info('filler.shutdown: no background work to drain in Plan 01');
    },
  };
}
