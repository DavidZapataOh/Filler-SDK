/**
 * `createFiller` — the SDK's main entry point.
 *
 * Two factories:
 *
 *   1. `createFiller(config)` — production posture. Solver authors bring
 *      their own viem `PublicClient` + `WalletClient` (Privy, Turnkey, Safe,
 *      hardware wallet, raw private key — anything). The SDK NEVER touches
 *      the private key. Recommended for any deployment exposed to real funds.
 *
 *   2. `createFillerFromPrivateKey(opts)` — convenience for tests, CI, the
 *      `create-filler` CLI starter, and quick spikes. Takes a hex private
 *      key + RPC URL, builds the viem clients internally, then calls
 *      `createFiller`. The private key is validated, never logged (Pino
 *      redacts), and stays in the closure of the wallet client — same
 *      footprint as a hand-built wallet client.
 *
 * Both factories share the same internal wiring (IntentStream, FillEngine,
 * IndexerClient, BondClient, KeeperHubClient → composed into a `Filler`
 * handle).
 *
 * Plan 02 ships the wiring + config validation + flat surface routing. The
 * actual log decoder / fill engine / indexer client / on-chain bond ops land
 * in plans 03-08.
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  isAddress,
  webSocket,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { z } from 'zod';

import {
  type ChainId,
  getDeployedAddresses,
  getViemChain,
  isSupportedChainId,
} from './chains';
import { ConfigInvalidError, FillerError } from './errors';
import { logger as defaultLogger } from './logger';
import { BondClient } from './bond/client';
import { FillEngine } from './fills/engine';
import { IndexerClient } from './indexer/client';
import { IntentStream } from './intents/stream';
import { KeeperHubClient } from './keeperhub/client';
import {
  type ChainContractAddresses,
  type Filler,
  type FillerConfig,
  type FillerLogger,
  type FillParams,
  type FillResult,
  type IndexerConfig,
  type Intent,
  type IntentFilter,
  isIntentFilterPredicate,
  type KeeperHubConfig,
  type ResolvedFillerConfig,
  type SubmitFillOptions,
} from './types';

const DEFAULT_INDEXER_BASE_URL = 'https://hints.filler.xyz';
const DEFAULT_INDEXER_TIMEOUT_MS = 1500;

// === Config schemas =======================================================

const AddressSchema = z
  .string()
  .refine(isAddress, { message: 'must be a 0x-prefixed 20-byte hex address' });

// Tightened: production solvers MUST use https/wss. Loopback (localhost,
// 127.0.0.1, anvil hosts) is allowed so docker-compose stacks + tests work.
const HttpsUrlSchema = z
  .string()
  .url()
  .refine(
    (u) => /^https:\/\//.test(u) || /^http:\/\/(?:localhost|127\.0\.0\.1|anvil)/.test(u),
    { message: 'rpc URL must be https:// (http:// only accepted for localhost / anvil)' },
  );

const WssUrlSchema = z
  .string()
  .url()
  .refine(
    (u) => /^wss:\/\//.test(u) || /^ws:\/\/(?:localhost|127\.0\.0\.1|anvil)/.test(u),
    { message: 'ws URL must be wss:// (ws:// only accepted for localhost / anvil)' },
  );

const TransportSchema = z.object({
  publicClient: z.unknown(),
  walletClient: z.unknown(),
});

const IndexerConfigSchema = z
  .object({
    baseUrl: z.string().url(),
    authToken: z.string().optional(),
    timeoutMs: z.number().int().positive().optional(),
  })
  .strict();

const KeeperHubConfigSchema = z
  .object({
    baseUrl: HttpsUrlSchema,
    apiKey: z.string().min(1, 'apiKey must not be empty'),
  })
  .strict();

const AddressesPatchSchema = z
  .object({
    poolManager: AddressSchema.optional(),
    permit2: AddressSchema.optional(),
    reactor: AddressSchema.optional(),
    filler: AddressSchema.optional(),
    fillerBond: AddressSchema.optional(),
  })
  .strict();

const ChainIdSchema = z
  .number()
  .int()
  .refine(isSupportedChainId, {
    message: 'unsupported chainId; see chains registry',
  });

const FillerConfigSchema = z
  .object({
    chainId: ChainIdSchema,
    account: AddressSchema,
    transport: TransportSchema,
    addresses: AddressesPatchSchema.optional(),
    indexer: IndexerConfigSchema.optional(),
    keeperHub: KeeperHubConfigSchema.optional(),
    // Loggers are structural — Zod can't introspect methods cleanly. Accept
    // anything and trust the FillerLogger contract; bad shape fails at first call.
    logger: z.custom<FillerLogger>().optional(),
  })
  // Strict mode rejects unknown keys. Mistyped fields like `rpc_url` (snake
  // case) won't silently no-op — the user gets a clear "unrecognized key" error.
  .strict();

const PrivateKeySchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{64}$/, 'must be a 0x-prefixed 32-byte hex private key');

const PrivateKeyConfigSchema = z
  .object({
    chainId: ChainIdSchema,
    privateKey: PrivateKeySchema,
    rpcUrl: HttpsUrlSchema,
    wsRpcUrl: WssUrlSchema.optional(),
    addresses: AddressesPatchSchema.optional(),
    indexer: IndexerConfigSchema.optional(),
    keeperHub: KeeperHubConfigSchema.optional(),
    logger: z.custom<FillerLogger>().optional(),
  })
  .strict();

// === Public types for the private-key factory ============================

export interface CreateFillerFromPrivateKeyConfig {
  chainId: ChainId;
  /** 0x-prefixed 32-byte hex private key. Validated, never logged. */
  privateKey: `0x${string}`;
  /** RPC URL — must be https:// (http:// only allowed for localhost / anvil). */
  rpcUrl: string;
  /** Optional WebSocket RPC URL for event subscription (wss://). */
  wsRpcUrl?: string;
  addresses?: Partial<ChainContractAddresses>;
  indexer?: IndexerConfig;
  keeperHub?: KeeperHubConfig;
  logger?: FillerLogger;
}

// === Resolver =============================================================

/**
 * Resolve a user-supplied `FillerConfig` into the SDK's internal
 * `ResolvedFillerConfig`. Pure — no I/O. Throws `ConfigInvalidError` with a
 * Zod issue list on failure.
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
  const canonical = getDeployedAddresses(config.chainId);
  const overrides = config.addresses ?? {};
  // Build address bag explicitly so `exactOptionalPropertyTypes: true` doesn't
  // widen the target with `undefined` from the optional-zod schema.
  const addresses: ChainContractAddresses = {
    poolManager: overrides.poolManager ?? canonical.poolManager,
    permit2: overrides.permit2 ?? canonical.permit2,
    reactor: overrides.reactor ?? canonical.reactor,
    filler: overrides.filler ?? canonical.filler,
    fillerBond: overrides.fillerBond ?? canonical.fillerBond,
  };

  const indexer: Required<IndexerConfig> = {
    baseUrl: config.indexer?.baseUrl ?? DEFAULT_INDEXER_BASE_URL,
    authToken: config.indexer?.authToken ?? '',
    timeoutMs: config.indexer?.timeoutMs ?? DEFAULT_INDEXER_TIMEOUT_MS,
  };

  return {
    chainId: config.chainId,
    account: config.account,
    transport: config.transport,
    addresses,
    indexer,
    keeperHub: config.keeperHub ?? null,
    logger: (config.logger ?? defaultLogger) as FillerLogger,
  };
}

// === Main factory =========================================================

/**
 * Build a `Filler` handle from a fully-validated config (BYO viem clients).
 */
export function createFiller(input: FillerConfig): Filler {
  const config = resolveFillerConfig(input);
  return assembleFiller(config);
}

/**
 * Build a `Filler` handle from a private key + RPC URL. The SDK constructs
 * viem `PublicClient` + `WalletClient` internally; private key never crosses
 * a logger boundary (Pino redaction in `logger.ts` strips `privateKey` paths
 * by default).
 *
 * Use this for: tests, CI, the `create-filler` starter, quick spikes.
 * For production solvers: use `createFiller` with your own viem clients.
 */
export function createFillerFromPrivateKey(
  input: CreateFillerFromPrivateKeyConfig,
): Filler {
  const parsed = PrivateKeyConfigSchema.safeParse(input);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new ConfigInvalidError(
      `invalid CreateFillerFromPrivateKeyConfig: ${issues}`,
      { context: { issues: parsed.error.issues } },
    );
  }
  const cfg = parsed.data;
  const chain = getViemChain(cfg.chainId);
  // Zod's regex confirms the 0x-prefix; cast to the templated type.
  const account = privateKeyToAccount(cfg.privateKey as `0x${string}`);

  const publicTransport = cfg.wsRpcUrl
    ? webSocket(cfg.wsRpcUrl, { retryCount: 5, retryDelay: 1000 })
    : http(cfg.rpcUrl, { retryCount: 3, retryDelay: 500 });
  const publicClient = createPublicClient({ chain, transport: publicTransport });
  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(cfg.rpcUrl, { retryCount: 3 }),
  });

  // Build the FillerConfig explicitly. Each optional field is added only if
  // it was supplied — keeps `exactOptionalPropertyTypes: true` happy.
  const downstream: FillerConfig = {
    chainId: cfg.chainId,
    account: account.address,
    transport: { publicClient, walletClient },
  };
  if (cfg.addresses !== undefined) {
    const addrs: Partial<ChainContractAddresses> = {};
    if (cfg.addresses.poolManager !== undefined) {
      addrs.poolManager = cfg.addresses.poolManager;
    }
    if (cfg.addresses.permit2 !== undefined) addrs.permit2 = cfg.addresses.permit2;
    if (cfg.addresses.reactor !== undefined) addrs.reactor = cfg.addresses.reactor;
    if (cfg.addresses.filler !== undefined) addrs.filler = cfg.addresses.filler;
    if (cfg.addresses.fillerBond !== undefined) {
      addrs.fillerBond = cfg.addresses.fillerBond;
    }
    downstream.addresses = addrs;
  }
  if (cfg.indexer !== undefined) {
    const idx: IndexerConfig = { baseUrl: cfg.indexer.baseUrl };
    if (cfg.indexer.authToken !== undefined) idx.authToken = cfg.indexer.authToken;
    if (cfg.indexer.timeoutMs !== undefined) idx.timeoutMs = cfg.indexer.timeoutMs;
    downstream.indexer = idx;
  }
  if (cfg.keeperHub !== undefined) downstream.keeperHub = cfg.keeperHub;
  if (cfg.logger !== undefined) downstream.logger = cfg.logger;

  return createFiller(downstream);
}

// === Internal assembly ====================================================

function assembleFiller(config: ResolvedFillerConfig): Filler {
  const log = config.logger;
  log.info(
    {
      chainId: config.chainId,
      account: config.account,
      indexer: config.indexer.baseUrl,
      keeperHubEnabled: config.keeperHub !== null,
    },
    'createFiller: handle constructed',
  );

  const indexer = new IndexerClient({
    baseUrl: config.indexer.baseUrl,
    authToken: config.indexer.authToken,
    timeoutMs: config.indexer.timeoutMs,
    logger: log,
  });

  const intentStream = new IntentStream({
    publicClient: config.transport.publicClient,
    reactorAddress: config.addresses.reactor,
    logger: log,
  });

  const keeperHub =
    config.keeperHub === null
      ? null
      : new KeeperHubClient({
          baseUrl: config.keeperHub.baseUrl,
          apiKey: config.keeperHub.apiKey,
          chainId: config.chainId,
          account: config.account,
          logger: log,
        });

  const fillEngine = new FillEngine({
    publicClient: config.transport.publicClient,
    walletClient: config.transport.walletClient,
    addresses: {
      filler: config.addresses.filler,
      reactor: config.addresses.reactor,
      poolManager: config.addresses.poolManager,
    },
    indexer,
    keeperHub,
    logger: log,
  });

  const bond = new BondClient({
    chainId: config.chainId,
    bondContract: config.addresses.fillerBond,
    account: config.account,
    publicClient: config.transport.publicClient,
    walletClient: config.transport.walletClient,
    logger: log,
  });

  let shutdownCalled = false;
  const shutdown = async () => {
    if (shutdownCalled) return;
    shutdownCalled = true;
    await intentStream.close();
    log.info('filler.shutdown complete');
  };

  const subscribeIntents = (
    filter: IntentFilter,
    onIntent: (intent: Intent) => void | Promise<void>,
  ): (() => void) => {
    return intentStream.subscribe(filter, async (intent) => {
      try {
        if (isIntentFilterPredicate(filter)) {
          // The IntentStream itself is filter-shape-aware (Plan 03 will wire
          // the predicate path); from the flat surface POV we just hand the
          // intent through. The wrapper still catches handler errors.
        }
        await onIntent(intent);
      } catch (err) {
        log.error({ err, orderHash: intent.orderHash }, 'subscribeIntents handler threw');
      }
    });
  };

  const prepareFill = (intent: Intent): Promise<FillParams | null> =>
    fillEngine.prepare(intent);

  const submitFill = (
    intent: Intent,
    params: FillParams,
    options?: SubmitFillOptions,
  ): Promise<FillResult> => fillEngine.execute(intent, params, options);

  return {
    chainId: config.chainId,
    account: config.account,
    config,
    intents: intentStream,
    fills: fillEngine,
    indexer,
    bond,
    subscribeIntents,
    prepareFill,
    submitFill,
    shutdown,
    close: shutdown,
  };
}
