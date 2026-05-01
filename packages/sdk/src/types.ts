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
 * Filter passed to `IntentStream` (Plan 03). Anything matched by the filter
 * is pushed to the consumer; non-matches are dropped at the indexer boundary
 * (no per-intent decoding cost in the solver process).
 */
export interface IntentFilter {
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

// === Fills =================================================================

/**
 * Parameters for a single fill, as constructed by the FillEngine (Plan 04).
 * The shape mirrors `FillParams` in the Solidity contract.
 */
export interface FillParams {
  /** PoolKey of the v4 pool to route through. */
  poolKey: PoolKey;
  /** True for token0 → token1; false for token1 → token0. */
  zeroForOne: boolean;
  /** Exact-input swap amount (signed: positive for exactIn). */
  amountSpecified: bigint;
  /**
   * Optional sqrt-price limit. `0n` means "no limit". The engine sets a
   * sensible default from the depth hint when unset.
   */
  sqrtPriceLimitX96: bigint;
  /** Optional hook data passed to v4 callbacks. `0x` for none. */
  hookData: Hex;
  /** Tick range for JIT inventory (Plan 05 calibrates this). */
  tickLower: number;
  tickUpper: number;
  /** Liquidity to add+remove inside the atomic fill. */
  liquidityDelta: bigint;
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
 * The handle returned by `createFiller`. Three composable surfaces:
 *
 *   filler.intents.subscribe(...) — listen for matching UniswapX intents
 *   filler.fills.execute(...)     — submit a fill (with simulate + broadcast)
 *   filler.indexer                — direct access to the JIT-hints HTTP client
 *
 * The handle is intentionally minimal: anything more advanced (bond ops,
 * keeperhub integrations, anvil testing) lives behind a separate import path
 * so tree-shaking can drop it.
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
  /** Stop all background work (intent stream, polling). Idempotent. */
  shutdown(): Promise<void>;
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
   * Optional `IndexerClient` config. Defaults to `https://hints.filler.xyz`
   * (the public hosted indexer) but every solver SHOULD self-host (see
   * `@filler-sdk/jit-hints`).
   */
  indexer?: IndexerConfig;
  /** Optional logger; defaults to a Pino instance with sensible production defaults. */
  logger?: FillerLogger;
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
 * `FillerConfig` but with all defaults applied.
 */
export interface ResolvedFillerConfig
  extends Required<Omit<FillerConfig, 'logger' | 'indexer'>> {
  indexer: Required<IndexerConfig>;
  logger: FillerLogger;
}

// === Surfaces — implemented in plans 03/04/06 =============================

export interface IntentSurface {
  /** Subscribe to intents matching `filter`. Returns an unsubscribe fn. */
  subscribe(filter: IntentFilter, onIntent: (i: Intent) => void): () => void;
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
  /** GET /health — used by readiness probes. */
  health(): Promise<{ status: 'ok' | 'degraded'; chains: readonly ChainStatus[] }>;
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
