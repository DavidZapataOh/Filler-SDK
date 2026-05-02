[@filler-sdk/sdk](../../README.md) / [index](../README.md) / IntentFilterCriteria

# Interface: IntentFilterCriteria

Defined in: [packages/sdk/src/types.ts:121](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L121)

## Properties

### chainIds?

```ts
optional chainIds?: readonly ChainId[];
```

Defined in: [packages/sdk/src/types.ts:123](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L123)

If set, only intents on these chains are surfaced.

***

### inputTokens?

```ts
optional inputTokens?: readonly `0x${string}`[];
```

Defined in: [packages/sdk/src/types.ts:128](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L128)

If set, only intents whose input token is in this list match. Matching is
lower-case checksum-insensitive.

***

### minInputAmount?

```ts
optional minInputAmount?: bigint;
```

Defined in: [packages/sdk/src/types.ts:132](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L132)

Minimum input amount in wei. Filters out dust before user code sees it.

***

### outputTokens?

```ts
optional outputTokens?: readonly `0x${string}`[];
```

Defined in: [packages/sdk/src/types.ts:130](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L130)

Likewise for any output token.

***

### reactors?

```ts
optional reactors?: readonly `0x${string}`[];
```

Defined in: [packages/sdk/src/types.ts:137](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L137)

If set, only intents emitted by these reactors are surfaced. Defaults to
the canonical UniswapX reactors per chain when unset.
