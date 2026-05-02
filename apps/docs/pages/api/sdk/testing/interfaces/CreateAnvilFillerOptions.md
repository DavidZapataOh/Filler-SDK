[@filler-sdk/sdk](../../README.md) / [testing](../README.md) / CreateAnvilFillerOptions

# Interface: CreateAnvilFillerOptions

Defined in: [packages/sdk/src/testing/anvil.ts:214](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/testing/anvil.ts#L214)

## Properties

### accountIndex?

```ts
optional accountIndex?: number;
```

Defined in: [packages/sdk/src/testing/anvil.ts:222](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/testing/anvil.ts#L222)

Anvil dev account index (0-9). Default 0.

***

### addresses?

```ts
optional addresses?: Partial<ChainContractAddresses>;
```

Defined in: [packages/sdk/src/testing/anvil.ts:216](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/testing/anvil.ts#L216)

Override addresses. Without these, the Filler points at PLACEHOLDER addresses.

***

### chainId?

```ts
optional chainId?: ChainId;
```

Defined in: [packages/sdk/src/testing/anvil.ts:218](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/testing/anvil.ts#L218)

Custom chain id. Default ANVIL_CHAIN_ID (31337).

***

### indexerBaseUrl?

```ts
optional indexerBaseUrl?: string;
```

Defined in: [packages/sdk/src/testing/anvil.ts:224](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/testing/anvil.ts#L224)

Optional indexer config. Default: localhost.

***

### logger?

```ts
optional logger?: FillerLogger;
```

Defined in: [packages/sdk/src/testing/anvil.ts:220](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/testing/anvil.ts#L220)

Custom logger — default uses SDK's silent default.
