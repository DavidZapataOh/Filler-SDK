/**
 * SDK-specific error hierarchy.
 *
 * Why a hierarchy: solver authors need to handle different failure modes
 * differently — `IntentExpiredError` should be silently dropped, `RPCError`
 * should be retried with backoff, `InsufficientLiquidityError` should be
 * surfaced to the strategy layer for re-routing, etc. A typed hierarchy
 * lets `instanceof` discriminators do the work without string-matching
 * `error.message`.
 *
 * Conventions:
 *   - All errors extend `FillerError` (the base class).
 *   - Each subclass has a unique `code` field — useful for log aggregation
 *     + the equivalent of HTTP status codes for SDK callers.
 *   - The `cause` field carries the original error so stacks aren't lost.
 *     Node 16.9+ + Bun support `new Error(msg, { cause })`; we re-use it.
 *   - JSON-serialisation safe: `toJSON()` emits `{ name, code, message, ... }`
 *     so structured loggers (Pino, OpenTelemetry) capture them cleanly.
 */

export type FillerErrorCode =
  | 'CONFIG_INVALID'
  | 'INTENT_EXPIRED'
  | 'INTENT_FILTERED'
  | 'INSUFFICIENT_LIQUIDITY'
  | 'RPC_ERROR'
  | 'INDEXER_ERROR'
  | 'SIMULATION_REVERTED'
  | 'BROADCAST_FAILED'
  | 'TIMEOUT'
  | 'UNKNOWN';

export interface FillerErrorOptions {
  cause?: unknown;
  /** Free-form context to attach (chainId, intent id, etc.). */
  context?: Record<string, unknown>;
}

/**
 * Base class for every SDK error.
 *
 * Usage:
 *
 *   try { await filler.fills.execute(intent, params); }
 *   catch (err) {
 *     if (err instanceof IntentExpiredError) { ... }
 *     if (err instanceof RPCError) { backoffAndRetry(err); }
 *     throw err; // unknown — propagate
 *   }
 */
export class FillerError extends Error {
  override readonly name: string = 'FillerError';
  readonly code: FillerErrorCode;
  readonly context: Record<string, unknown>;

  constructor(code: FillerErrorCode, message: string, opts: FillerErrorOptions = {}) {
    // ES2022's `Error(message, { cause })` ctor is supported on every runtime
    // we target (Node 20+, Bun 1.x). No polyfill needed.
    super(message, opts.cause === undefined ? undefined : { cause: opts.cause });
    this.code = code;
    this.context = opts.context ?? {};
    // V8 stack capture — preserves the throw site as the top frame.
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, new.target);
    }
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context,
      cause: this.cause === undefined ? undefined : String(this.cause),
    };
  }
}

/** Thrown when `createFiller` receives an invalid config. */
export class ConfigInvalidError extends FillerError {
  override readonly name = 'ConfigInvalidError';
  constructor(message: string, opts: FillerErrorOptions = {}) {
    super('CONFIG_INVALID', message, opts);
  }
}

/**
 * Thrown when an intent's deadline has passed before we could broadcast.
 * Solver code should silently drop these (no point retrying an expired
 * intent — the swapper has likely re-signed elsewhere).
 */
export class IntentExpiredError extends FillerError {
  override readonly name = 'IntentExpiredError';
  constructor(deadline: bigint, now: bigint, opts: FillerErrorOptions = {}) {
    super('INTENT_EXPIRED', `intent expired: deadline=${deadline} now=${now}`, {
      ...opts,
      context: { ...opts.context, deadline: deadline.toString(), now: now.toString() },
    });
  }
}

/**
 * Thrown when the indexer reports the candidate fill exceeds available depth
 * at the requested slippage. The strategy layer should treat this as "can't
 * fill at this size" and either narrow the size or skip the intent.
 */
export class InsufficientLiquidityError extends FillerError {
  override readonly name = 'InsufficientLiquidityError';
  constructor(message: string, opts: FillerErrorOptions = {}) {
    super('INSUFFICIENT_LIQUIDITY', message, opts);
  }
}

/**
 * Wraps any RPC-level failure (transport timeout, 5xx from provider, etc.).
 * Retryable — solver code SHOULD back off and retry on these.
 */
export class RPCError extends FillerError {
  override readonly name = 'RPCError';
  constructor(message: string, opts: FillerErrorOptions = {}) {
    super('RPC_ERROR', message, opts);
  }
}

/** Wraps any non-2xx response from the JIT-hints indexer. */
export class IndexerError extends FillerError {
  override readonly name = 'IndexerError';
  /** HTTP status, when known. */
  readonly status: number | undefined;
  constructor(
    message: string,
    opts: FillerErrorOptions & { status?: number } = {},
  ) {
    super('INDEXER_ERROR', message, opts);
    this.status = opts.status;
  }
}

/**
 * Pre-flight `eth_call` reverted. Carries the decoded revert reason when the
 * SDK can recover it from the error data — see `decodeRevert` in Plan 04.
 */
export class SimulationRevertedError extends FillerError {
  override readonly name = 'SimulationRevertedError';
  /** Decoded revert reason. Best-effort; may be absent for raw reverts. */
  readonly revertReason: string | undefined;
  constructor(
    message: string,
    opts: FillerErrorOptions & { revertReason?: string } = {},
  ) {
    super('SIMULATION_REVERTED', message, opts);
    this.revertReason = opts.revertReason;
  }
}

/** Broadcast accepted but the receipt status was 0 (reverted on-chain). */
export class BroadcastFailedError extends FillerError {
  override readonly name = 'BroadcastFailedError';
  constructor(message: string, opts: FillerErrorOptions = {}) {
    super('BROADCAST_FAILED', message, opts);
  }
}

/** Generic timeout for any operation that didn't complete within budget. */
export class TimeoutError extends FillerError {
  override readonly name = 'TimeoutError';
  constructor(message: string, opts: FillerErrorOptions = {}) {
    super('TIMEOUT', message, opts);
  }
}
