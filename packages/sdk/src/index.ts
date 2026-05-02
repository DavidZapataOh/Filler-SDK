/**
 * `@filler-sdk/sdk` — public entry point.
 *
 * Anything exported from here is part of the package's stable API. Adding,
 * removing or renaming an export here is a semver-breaking change.
 *
 * Sub-path entries:
 *   '@filler-sdk/sdk/bond'      — BondClient (Plan 07)
 *   '@filler-sdk/sdk/keeperhub' — KeeperHubClient (Plan 08)
 *   '@filler-sdk/sdk/testing'   — Anvil + mock fixtures (Plan 09)
 *   '@filler-sdk/sdk/abis'      — auto-generated ABIs
 *
 * The sub-path entries are tree-shakeable — importing the main entry does
 * NOT pull in bond/keeperhub/testing/abis bundles.
 */

// === Top-level handle ======================================================
export {
  type CreateFillerFromPrivateKeyConfig,
  createFiller,
  createFillerFromPrivateKey,
  resolveFillerConfig,
} from './createFiller';

// === Public types ==========================================================
export type {
  BondClientHandle,
  ChainContractAddresses,
  ChainId,
  ChainStatus,
  DepthHint,
  DepthQuery,
  Filler,
  FillerConfig,
  FillerLogger,
  FillerTransport,
  FillParams,
  FillResult,
  FillSurface,
  IndexerConfig,
  IndexerSurface,
  Intent,
  IntentFilter,
  IntentFilterCriteria,
  IntentFilterPredicate,
  IntentSurface,
  KeeperHubConfig,
  PoolId,
  PoolInfo,
  PoolKey,
  ResolvedFillerConfig,
  ResolvedOutput,
  SimulationResult,
  SubmitFillOptions,
  TokenAmount,
} from './types';

// Type guard exposed alongside its types.
export { isIntentFilterPredicate } from './types';

// === Errors ================================================================
export {
  BroadcastFailedError,
  ConfigInvalidError,
  type FillerErrorCode,
  type FillerErrorOptions,
  FillerError,
  IndexerError,
  IntentExpiredError,
  InsufficientLiquidityError,
  RPCError,
  SimulationRevertedError,
  TimeoutError,
} from './errors';

// === Chains + addresses ===================================================
export {
  type ChainConfig,
  type ChainDeployedAddresses,
  type ChainName,
  chains,
  getChainById,
  getChainByName,
  getDeployedAddresses,
  getViemChain,
  isSupportedChainId,
} from './chains';

// === Logging ==============================================================
export { childLogger, createDefaultLogger, silenceLoggerForTests } from './logger';

/**
 * SDK semver — surfaced so downstream code can log it for observability /
 * bug reports. Synced manually with `package.json:version`.
 */
export const SDK_VERSION = '0.0.0' as const;
