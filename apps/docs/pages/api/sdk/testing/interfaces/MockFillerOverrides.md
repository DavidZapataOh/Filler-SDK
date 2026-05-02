[@filler-sdk/sdk](../../README.md) / [testing](../README.md) / MockFillerOverrides

# Interface: MockFillerOverrides

Defined in: [packages/sdk/src/testing/mocks.ts:48](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/testing/mocks.ts#L48)

## Properties

### account?

```ts
optional account?: `0x${string}`;
```

Defined in: [packages/sdk/src/testing/mocks.ts:50](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/testing/mocks.ts#L50)

***

### bond?

```ts
optional bond?: Partial<BondClientHandle>;
```

Defined in: [packages/sdk/src/testing/mocks.ts:54](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/testing/mocks.ts#L54)

***

### chainId?

```ts
optional chainId?: ChainId;
```

Defined in: [packages/sdk/src/testing/mocks.ts:49](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/testing/mocks.ts#L49)

***

### config?

```ts
optional config?: Partial<ResolvedFillerConfig>;
```

Defined in: [packages/sdk/src/testing/mocks.ts:56](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/testing/mocks.ts#L56)

Replace the resolved config (typically just to swap addresses for an Anvil-deployed test).

***

### fills?

```ts
optional fills?: Partial<FillSurface>;
```

Defined in: [packages/sdk/src/testing/mocks.ts:52](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/testing/mocks.ts#L52)

***

### indexer?

```ts
optional indexer?: Partial<IndexerSurface>;
```

Defined in: [packages/sdk/src/testing/mocks.ts:53](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/testing/mocks.ts#L53)

***

### intents?

```ts
optional intents?: Partial<IntentSurface>;
```

Defined in: [packages/sdk/src/testing/mocks.ts:51](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/testing/mocks.ts#L51)
