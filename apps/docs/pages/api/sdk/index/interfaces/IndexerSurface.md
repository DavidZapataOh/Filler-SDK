[@filler-sdk/sdk](../../README.md) / [index](../README.md) / IndexerSurface

# Interface: IndexerSurface

Defined in: [packages/sdk/src/types.ts:509](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L509)

## Methods

### depth()

```ts
depth(query): Promise<DepthHint>;
```

Defined in: [packages/sdk/src/types.ts:511](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L511)

GET /depth — fetch a JIT depth hint for a pool + size + direction.

#### Parameters

##### query

[`DepthQuery`](DepthQuery.md)

#### Returns

`Promise`&lt;[`DepthHint`](DepthHint.md)&gt;

***

### findPool()

```ts
findPool(
   input, 
   output, 
   chainId): Promise<PoolInfo | null>;
```

Defined in: [packages/sdk/src/types.ts:518](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L518)

Resolve a pool for a token pair. Returns the pool best suited to fill
an intent for `(input, output)` on `chainId`, or `null` if no indexed
pool matches. Selection: hookless first, then highest liquidity, then
lowest fee tier (so callers get a deterministic best-pool choice).

#### Parameters

##### input

`` `0x$&#123;string&#125;` ``

##### output

`` `0x$&#123;string&#125;` ``

##### chainId

[`ChainId`](../type-aliases/ChainId.md)

#### Returns

`Promise`&lt;[`PoolInfo`](PoolInfo.md) \| `null`&gt;

***

### health()

```ts
health(): Promise<{
  chains: readonly ChainStatus[];
  status: "ok" | "degraded";
}>;
```

Defined in: [packages/sdk/src/types.ts:530](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L530)

GET /health — used by readiness probes.

#### Returns

`Promise`&lt;\&#123;
  `chains`: readonly [`ChainStatus`](ChainStatus.md)[];
  `status`: `"ok"` \| `"degraded"`;
\&#125;&gt;

***

### subscribeDepth()

```ts
subscribeDepth(query, onHint): () => void;
```

Defined in: [packages/sdk/src/types.ts:525](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L525)

SSE-stream of `DepthHint` updates for `query`. Returns an unsubscribe fn.
The stream auto-reconnects on transport failure with exponential backoff.
Errors during connection are logged; the callback only fires on a
successfully decoded hint payload.

#### Parameters

##### query

[`DepthQuery`](DepthQuery.md)

##### onHint

(`hint`) => `void` \| `Promise`&lt;`void`&gt;

#### Returns

() => `void`
