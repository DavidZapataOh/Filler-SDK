/**
 * Public types for `@filler-sdk/sdk`.
 *
 * The shapes here are the user-facing API: anything a downstream solver author
 * imports goes through these. Implementation details (intent decoding,
 * fill-engine internals, indexer client wiring) live in their own modules and
 * are NOT re-exported.
 *
 * Conventions:
 *   - All on-chain identifiers are `0x${string}` template literal types so
 *     viem's RPC layer accepts them without runtime casting.
 *   - `bigint` for any 256-bit on-chain value (amounts, sqrtPriceX96,
 *     liquidity, deadlines).
 *   - `number` for chain ids (always fits in Number.MAX_SAFE_INTEGER) and
 *     tick values (int24).
 *   - All public types are documented with JSDoc. Solver authors will read
 *     them via TypeScript hovers in their editor — that's the docs surface.
 */

import type { Address, Hash, Hex } from 'viem';

import type { ChainId } from './chains';

export type { ChainId };

// === Core domain ===========================================================

/**
 * v4 PoolKey — the 5-tuple that uniquely identifies a v4 pool. Mirrors the
 * Solidity struct exactly; ordering matters for `keccak256` pool-id derivation.
 */
export interface PoolKey {
  /** ERC-20 with the lower address (`currency0 < currency1` is enforced by v4). */
  currency0: Address;
  /** ERC-20 with the higher address. Native ETH is encoded as the zero address. */
  currency1: Address;
  /** Static fee in pips (`1e6` units). 3000 = 0.30%. */
  fee: number;
  /** Tick spacing — must match the pool's deployment. */
  tickSpacing: number;
  /** Hook contract address; `0x000…000` for hookless pools. */
  hooks: Address;
}

/**
 * Pool id = `keccak256(abi.encode(PoolKey))`. Always 32 bytes; `0x`-prefixed
 * 66 chars total. The indexer keys all pool state by this hash.
 */
export type PoolId = `0x${string}`;

/**
 * A UniswapX intent, as parsed from the on-chain `OrderEvent` log. The SDK
 * normalises Reactor-specific fields into this canonical shape so solver
 * authors don't have to special-case ExclusiveDutchOrder vs V2DutchOrder vs
 * future order types.
 */
export interface Intent {
  /** Reactor that emitted the order — used to route fills back. */
  reactor: Address;
  /** Address that signed the order (the swapper). */
  swapper: Address;
  /** Order nonce, scoped to the swapper's Permit2. */
  nonce: bigint;
  /** UNIX timestamp (seconds) past which the order is no longer fillable. */
  deadline: bigint;
  /** Optional additional validation contract (`address(0)` if unset). */
  additionalValidationContract: Address;
  /** Encoded `bytes` passed to additional validation, if any. */
  additionalValidationData: Hex;
  /** Input token + amount the swapper offers. */
  input: TokenAmount;
  /** Output tokens + minimums the swapper requires. */
  outputs: ResolvedOutput[];
  /** Chain id the order is valid on. */
  chainId: ChainId;
  /** Block number at which we observed the order. */
  observedAt: bigint;
  /** Transaction hash that emitted the order log. */
  txHash: Hash;
  /** keccak256 of the canonical encoded order (used as the unique key). */
  orderHash: Hash;
  /**
   * Raw ABI-encoded order bytes — required to reconstruct a `SignedOrder` for
   * `Filler.execute(SignedOrder, bytes)`. Sourced from the original
   * `OrderEvent` log payload.
   */
  rawOrder: Hex;
  /** Swapper's signature over the canonical order bytes. */
  signature: Hex;
}

export interface TokenAmount {
  token: Address;
  amount: bigint;
}

export interface ResolvedOutput {
  token: Address;
  /** Minimum amount the swapper must receive on the output side. */
  amount: bigint;
  /** Recipient (usually the swapper, but Permit2 allows redirection). */
  recipient: Address;
}

/**
 * Filter passed to `IntentStream` (Plan 03). Two valid shapes:
 *
 *   1. `IntentFilterCriteria` — a typed object with optional fields. The
 *      stream evaluates each field against the intent and only emits matches.
 *      Best for static filters known at boot.
 *
 *   2. `IntentFilterPredicate` — a function `(intent) => boolean | Promise<boolean>`.
 *      Best for dynamic filters that depend on per-intent computation
 *      (e.g. "only intents where the input token is in our hot-pool set").
 *
 * Anything matched by the filter is pushed to the consumer; non-matches are
 * dropped at the stream boundary (no per-intent decoding cost downstream).
 */
export type IntentFilter = IntentFilterCriteria | IntentFilterPredicate;

export interface IntentFilterCriteria {
  /** If set, only intents on these chains are surfaced. */
  chainIds?: readonly ChainId[];
  /**
   * If set, only intents whose input token is in this list match. Matching is
   * lower-case checksum-insensitive.
   */
  inputTokens?: readonly Address[];
  /** Likewise for any output token. */
  outputTokens?: readonly Address[];
  /** Minimum input amount in wei. Filters out dust before user code sees it. */
  minInputAmount?: bigint;
  /**
   * If set, only intents emitted by these reactors are surfaced. Defaults to
   * the canonical UniswapX reactors per chain when unset.
   */
  reactors?: readonly Address[];
}

export type IntentFilterPredicate = (
  intent: Intent,
) => boolean | Promise<boolean>;

/** Type guard separating the two filter shapes. */
export function isIntentFilterPredicate(
  filter: IntentFilter,
): filter is IntentFilterPredicate {
  return typeof filter === 'function';
}

// === Fills =================================================================

/**
 * Parameters for a single fill, as constructed by the FillEngine (Plan 04).
 *
 * Shape mirrors the Solidity `FillParams` struct in
 * `contracts/src/libraries/FillParams.sol` exactly, so ABI-encoding via viem's
 * `encodeAbiParameters` produces bytes that round-trip through the contract's
 * `FillParamsLib.validate()`.
 *
 * Field-by-field invariants (enforced on-chain):
 *   - `tickLower < tickUpper`, both within [MIN_TICK, MAX_TICK]
 *   - both ticks divisible by `poolKey.tickSpacing`
 *   - `liquidityDelta`, `inputAmount`, `outputAmount` all non-zero
 *   - `inputCurrency`/`outputCurrency` match `poolKey.currency0/1` per `zeroForOne`
 *   - `deadline > block.timestamp`
 */
export interface FillParams {
  /** PoolKey of the v4 pool to route through. */
  poolKey: PoolKey;
  /** Currency the swapper is sending in. */
  inputCurrency: Address;
  /** Currency the swapper expects out. */
  outputCurrency: Address;
  /** Amount of `inputCurrency` provided. */
  inputAmount: bigint;
  /** Minimum amount of `outputCurrency` the swapper accepts. */
  outputAmount: bigint;
  /** True for token0 → token1; false for token1 → token0. */
  zeroForOne: boolean;
  /** Lower bound of the JIT range (must align to `poolKey.tickSpacing`). */
  tickLower: number;
  /** Upper bound of the JIT range. */
  tickUpper: number;
  /** Liquidity to add (and later remove) for the JIT cycle. */
  liquidityDelta: bigint;
  /** Estimated fees captured — emitted in events for analytics. */
  feesCaptured: bigint;
  /** UNIX timestamp past which the fill is invalid. */
  deadline: bigint;
}

/**
 * What a fill produced — returned to user code after a successful broadcast.
 * Failures throw a typed `FillerError` instead.
 */
export interface FillResult {
  /** Transaction hash of the broadcast fill. */
  txHash: Hash;
  /** Block number it was included in (post-receipt). */
  blockNumber: bigint;
  /** Effective gas price paid (priority + base). */
  effectiveGasPriceWei: bigint;
  /** Total gas used. */
  gasUsed: bigint;
  /** Fee captured by the solver, in the output token. */
  feeCapturedAmount: bigint;
  /** The original intent that was filled. */
  intent: Intent;
  /** The params used to fill it. */
  params: FillParams;
}

// === Top-level handle ======================================================

/**
 * The handle returned by `createFiller`.
 *
 * Two equivalent ways to drive it:
 *
 *   1. Grouped surfaces — explicit + tree-shake friendly:
 *        filler.intents.subscribe(filter, onIntent)
 *        filler.fills.execute(intent, params)
 *        filler.indexer.depth(query)
 *
 *   2. Flat surface — closer to legacy 1inch-fusion ergonomics, easier for
 *      tutorials + the `create-filler` CLI starter:
 *        filler.subscribeIntents(predicate, onIntent)
 *        filler.prepareFill(intent)
 *        filler.submitFill(intent, params, opts)
 *
 * Both routes hit the same internal `IntentStream` / `FillEngine` /
 * `IndexerClient`, so picking one is purely a style choice.
 */
export interface Filler {
  /** Configured chain id. */
  readonly chainId: ChainId;
  /** Solver-controlled EOA / Safe that signs fills. */
  readonly account: Address;
  /** Read-only access to the SDK's resolved config. */
  readonly config: ResolvedFillerConfig;
  /** Intent stream surface — fully typed in Plan 03. */
  readonly intents: IntentSurface;
  /** Fill engine surface — fully typed in Plan 04. */
  readonly fills: FillSurface;
  /** JIT-hints HTTP client — typed in Plan 06. */
  readonly indexer: IndexerSurface;
  /**
   * Bond client surface — stake / unstake / withdraw against `FillerBond`.
   * Typed in Plan 07.
   */
  readonly bond: BondClientHandle;

  // === Flat surface (Plan 02) — shortcuts onto the same underlying objects ==

  /**
   * Subscribe to intents matching `filter`. Same semantics as
   * `intents.subscribe(filter, onIntent)`. Errors thrown by `onIntent` are
   * caught + logged so a bad handler doesn't tear down the stream.
   * Returns an unsubscribe function.
   */
  subscribeIntents(
    filter: IntentFilter,
    onIntent: (intent: Intent) => void | Promise<void>,
  ): () => void;

  /**
   * Build the `FillParams` for an intent, returning `null` if no profitable
   * fill exists (slippage budget exhausted, depth too thin, etc.). Wraps
   * `fills.simulate` + tick-calibration logic. Implementation lands in
   * Plan 04 + Plan 05.
   */
  prepareFill(intent: Intent): Promise<FillParams | null>;

  /**
   * End-to-end fill: simulate → sign → broadcast → wait for receipt. Same as
   * `fills.execute`, but accepts a `SubmitFillOptions` bag for routing /
   * gas multiplier / KeeperHub override.
   */
  submitFill(
    intent: Intent,
    params: FillParams,
    options?: SubmitFillOptions,
  ): Promise<FillResult>;

  /** Stop all background work (intent stream, polling). Idempotent. */
  shutdown(): Promise<void>;

  /** Alias for `shutdown` — matches the Plan 02 spec ergonomics. */
  close(): Promise<void>;
}

/**
 * Options for `Filler.submitFill` / `fills.execute`.
 *
 * All fields are optional + have sane defaults wired in `createFiller`. The
 * struct is open for extension — Plan 08 (KeeperHub) will add fields here
 * without breaking existing call sites.
 */
export interface SubmitFillOptions {
  /**
   * If true (and KeeperHub is configured), route the fill through the
   * KeeperHub's mempool-private path. Default: true if KeeperHub is
   * configured, else false.
   */
  useKeeperHub?: boolean;
  /**
   * Multiplier on the simulation's gas estimate before broadcast. Defaults
   * to `1.2` so we don't underprice volatile blocks.
   */
  gasMultiplier?: number;
  /**
   * If true, use the wallet's private-routing transport (Flashbots / Titan /
   * MEV-Share) when available. Default: false (mempool).
   */
  privateRouting?: boolean;
}

/**
 * Minimum public surface of the BondClient — the actual class lives in
 * `src/bond/client.ts` and is exported from `@filler-sdk/sdk/bond`. We
 * reference its handle from the top-level `Filler` so users can write
 * `filler.bond.totalStake()` without a second import.
 */
export interface BondClientHandle {
  readonly chainId: ChainId;
  readonly bondContract: Address;
  readonly account: Address;
  totalStake(): Promise<bigint>;
  activeStake(): Promise<bigint>;
  pendingUnstake(): Promise<bigint>;
  slashedTotal(): Promise<bigint>;
  requestUnstake(amount: bigint): Promise<Hash>;
  withdraw(): Promise<Hash>;
}

/** User-supplied configuration. Validated at runtime by `createFiller`. */
export interface FillerConfig {
  /** Chain to operate on. */
  chainId: ChainId;
  /** Solver account address. The SDK NEVER touches private keys. */
  account: Address;
  /**
   * viem PublicClient + WalletClient. The SDK is signer-agnostic — bring your
   * own (Privy, Turnkey, raw private key, hardware wallet, etc.).
   */
  transport: FillerTransport;
  /**
   * On-chain contract addresses. Required for `submitFill` / bond ops. If
   * omitted the SDK falls back to `getDeployedAddresses(chainId)` — but for
   * mainnets these are placeholder until Sprint 01's deploy script lands, so
   * production callers MUST set them explicitly.
   */
  addresses?: Partial<Pick<ChainContractAddresses, 'filler' | 'fillerBond' | 'reactor' | 'poolManager'>>;
  /**
   * Optional `IndexerClient` config. Defaults to `https://hints.filler.xyz`
   * (the public hosted indexer) but every solver SHOULD self-host (see
   * `@filler-sdk/jit-hints`).
   */
  indexer?: IndexerConfig;
  /**
   * Optional KeeperHub config. When set, `submitFill({ useKeeperHub: true })`
   * routes through the hub's mempool-private path. Plan 08.
   */
  keeperHub?: KeeperHubConfig;
  /**
   * Optional intent source — pluggable transport for the IntentStream.
   * Defaults to `null` ("no feed"); subscribers attach but receive nothing
   * until a source is wired. Pass `createPollingIntentSource(...)` for
   * production, `createMockIntentSource(...)` for tests, or implement your
   * own. Plan 03.
   */
  intentSource?: IntentSourceLike;
  /**
   * Per-subscriber bounded queue size for the IntentStream's backpressure.
   * Default 100. Drops are counted in `IntentStream.droppedTotal`.
   */
  intentQueueSize?: number;
  /** Optional logger; defaults to a Pino instance with sensible production defaults. */
  logger?: FillerLogger;
}

/**
 * Structural shape of an IntentSource — types.ts mirrors the runtime contract
 * in `intents/source.ts` so downstream consumers can author against it from
 * the public types entry without a deep import.
 */
export interface IntentSourceLike {
  start(sink: {
    push(intent: Intent): Promise<void>;
    hasSubscribers(): boolean;
  }):
    | Promise<() => Promise<void> | void>
    | (() => Promise<void> | void);
  list(filter?: IntentFilter): Promise<readonly Intent[]>;
  readonly label: string;
}

/**
 * Subset of `ChainDeployedAddresses` that solver authors override per
 * environment. Re-exported here so users can type their config bag without
 * importing from `./chains`.
 */
export interface ChainContractAddresses {
  poolManager: Address;
  permit2: Address;
  reactor: Address;
  filler: Address;
  fillerBond: Address;
}

export interface KeeperHubConfig {
  /** Hub base URL. Must be `https://`. */
  baseUrl: string;
  /** Bearer token issued during solver onboarding. */
  apiKey: string;
}

/**
 * Transport bag. Required clients are typed as `unknown` here to keep the
 * SDK's public surface free of viem's deep generic graph; `createFiller`
 * (Plan 02) narrows them to `PublicClient` + `WalletClient` with a runtime
 * brand check. This is identical to how wagmi v2 types its config.
 */
export interface FillerTransport {
  publicClient: unknown;
  walletClient: unknown;
}

export interface IndexerConfig {
  /** Base URL of the JIT-hints HTTP API (no trailing slash). */
  baseUrl: string;
  /** Optional bearer token for hosted-indexer auth. */
  authToken?: string;
  /**
   * Default per-request timeout in ms. The indexer is expected to respond in
   * <50 ms for cache hits + <200 ms cold; 1500 ms is a generous ceiling.
   */
  timeoutMs?: number;
}

/**
 * Resolved + validated config — what the SDK uses internally. Same shape as
 * `FillerConfig` but with every default applied.
 */
export interface ResolvedFillerConfig {
  chainId: ChainId;
  account: Address;
  transport: FillerTransport;
  addresses: ChainContractAddresses;
  indexer: Required<IndexerConfig>;
  keeperHub: KeeperHubConfig | null;
  intentSource: IntentSourceLike | null;
  intentQueueSize: number;
  logger: FillerLogger;
}

// === Surfaces — implemented in plans 03/04/06 =============================

export interface IntentSurface {
  /**
   * Subscribe to intents matching `filter`. The handler may be async — the
   * stream awaits it sequentially (back-pressure-safe). Errors thrown by the
   * handler are caught + logged, never killing the subscription.
   * Returns an unsubscribe function (idempotent).
   */
  subscribe(
    filter: IntentFilter,
    onIntent: (i: Intent) => void | Promise<void>,
  ): () => void;
  /** Snapshot the current open-intent set without subscribing. */
  list(filter?: IntentFilter): Promise<readonly Intent[]>;
}

export interface FillSurface {
  /** Run a fill end-to-end: simulate → sign → broadcast → wait for receipt. */
  execute(intent: Intent, params: FillParams): Promise<FillResult>;
  /** Pre-flight a fill (eth_call against the latest block). */
  simulate(intent: Intent, params: FillParams): Promise<SimulationResult>;
}

export interface SimulationResult {
  /** True if the simulated tx would succeed. */
  ok: boolean;
  /** Estimated gas — undefined when ok=false. */
  gasEstimate?: bigint;
  /** Decoded revert reason, when available. */
  revertReason?: string;
}

export interface IndexerSurface {
  /** GET /depth — fetch a JIT depth hint for a pool + size + direction. */
  depth(query: DepthQuery): Promise<DepthHint>;
  /**
   * Resolve a pool for a token pair. Returns the pool best suited to fill
   * an intent for `(input, output)` on `chainId`, or `null` if no indexed
   * pool matches. The selection heuristic (highest liquidity / lowest fee /
   * preferred hook) is implementation-defined and lands in Plan 06.
   */
  findPool(input: Address, output: Address, chainId: ChainId): Promise<PoolInfo | null>;
  /** GET /health — used by readiness probes. */
  health(): Promise<{ status: 'ok' | 'degraded'; chains: readonly ChainStatus[] }>;
}

/**
 * Resolved pool metadata returned by `IndexerSurface.findPool`. Carries the
 * full PoolKey + identity fields the FillEngine needs to build `FillParams`.
 */
export interface PoolInfo {
  /** keccak256(PoolKey) — the indexer's primary key. */
  id: PoolId;
  /** Lower-address token. */
  currency0: Address;
  /** Higher-address token. */
  currency1: Address;
  /** Static fee in pips. */
  fee: number;
  /** Tick spacing — both fill ticks must be divisible by this. */
  tickSpacing: number;
  /** Hook contract; `0x000…000` for hookless pools. */
  hooks: Address;
  /** Current sqrt(price) × 2^96. Useful for the FillEngine's calibration. */
  sqrtPriceX96: bigint;
  /** Current liquidity across the pool. */
  liquidity: bigint;
  /** Current tick. */
  tick: number;
}

/**
 * Re-exported from `@filler-sdk/jit-hints` (the indexer package owns the
 * canonical shape). We surface them here as a convenience so SDK consumers
 * don't need a second import for one type.
 */
export interface DepthQuery {
  pool: PoolId;
  size: bigint;
  zeroForOne: boolean;
  slippageBps?: number;
}

export interface DepthHint {
  pool: PoolId;
  hint: {
    tickLower: number;
    tickUpper: number;
    liquidityDelta: bigint;
    expectedFeeCapture: bigint;
  };
}

export interface ChainStatus {
  chainId: ChainId;
  latestBlock: bigint;
  lastUpdatedAt: bigint;
}

// === Logging ===============================================================

/**
 * Minimum surface every logger we accept must implement. Compatible with
 * `pino`, `console`, `winston`, `tslog`, etc. — solver authors keep their
 * existing logger.
 */
export interface FillerLogger {
  trace(obj: unknown, msg?: string): void;
  debug(obj: unknown, msg?: string): void;
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
  child?(bindings: Record<string, unknown>): FillerLogger;
}
