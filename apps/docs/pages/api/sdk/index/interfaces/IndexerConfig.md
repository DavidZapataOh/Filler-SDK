[@filler-sdk/sdk](../../README.md) / [index](../README.md) / IndexerConfig

# Interface: IndexerConfig

Defined in: [packages/sdk/src/types.ts:448](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L448)

## Properties

### authToken?

```ts
optional authToken?: string;
```

Defined in: [packages/sdk/src/types.ts:452](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L452)

Optional bearer token for hosted-indexer auth.

***

### baseUrl

```ts
baseUrl: string;
```

Defined in: [packages/sdk/src/types.ts:450](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L450)

Base URL of the JIT-hints HTTP API (no trailing slash).

***

### timeoutMs?

```ts
optional timeoutMs?: number;
```

Defined in: [packages/sdk/src/types.ts:457](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L457)

Default per-request timeout in ms. The indexer is expected to respond in
&lt;\10 ms for cache hits + &lt;\100 ms cold; 1500 ms is a generous ceiling.
