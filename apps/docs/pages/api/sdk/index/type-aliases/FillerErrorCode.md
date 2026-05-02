[@filler-sdk/sdk](../../README.md) / [index](../README.md) / FillerErrorCode

# Type Alias: FillerErrorCode

```ts
type FillerErrorCode = 
  | "CONFIG_INVALID"
  | "INTENT_EXPIRED"
  | "INTENT_FILTERED"
  | "INSUFFICIENT_LIQUIDITY"
  | "RPC_ERROR"
  | "INDEXER_ERROR"
  | "SIMULATION_REVERTED"
  | "BROADCAST_FAILED"
  | "TIMEOUT"
  | "UNKNOWN";
```

Defined in: [packages/sdk/src/errors.ts:21](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/errors.ts#L21)

SDK-specific error hierarchy.

Why a hierarchy: solver authors need to handle different failure modes
differently — `IntentExpiredError` should be silently dropped, `RPCError`
should be retried with backoff, `InsufficientLiquidityError` should be
surfaced to the strategy layer for re-routing, etc. A typed hierarchy
lets `instanceof` discriminators do the work without string-matching
`error.message`.

Conventions:
  - All errors extend `FillerError` (the base class).
  - Each subclass has a unique `code` field — useful for log aggregation
    + the equivalent of HTTP status codes for SDK callers.
  - The `cause` field carries the original error so stacks aren't lost.
    Node 16.9+ + Bun support `new Error(msg, &#123; cause &#125;)`; we re-use it.
  - JSON-serialisation safe: `toJSON()` emits `&#123; name, code, message, ... &#125;`
    so structured loggers (Pino, OpenTelemetry) capture them cleanly.
