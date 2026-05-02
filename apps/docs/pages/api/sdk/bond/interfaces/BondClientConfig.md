[@filler-sdk/sdk](../../README.md) / [bond](../README.md) / BondClientConfig

# Interface: BondClientConfig

Defined in: [packages/sdk/src/bond/client.ts:56](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/bond/client.ts#L56)

## Properties

### account

```ts
account: `0x${string}`;
```

Defined in: [packages/sdk/src/bond/client.ts:63](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/bond/client.ts#L63)

Solver account that owns the stake (also `msg.sender` for writes).

***

### bondContract

```ts
bondContract: `0x${string}`;
```

Defined in: [packages/sdk/src/bond/client.ts:59](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/bond/client.ts#L59)

Address of the deployed `FillerBond.sol` contract.

***

### chainId

```ts
chainId: ChainId;
```

Defined in: [packages/sdk/src/bond/client.ts:57](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/bond/client.ts#L57)

***

### fillerContract

```ts
fillerContract: `0x${string}`;
```

Defined in: [packages/sdk/src/bond/client.ts:61](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/bond/client.ts#L61)

Address of the `Filler.sol` deployment this bond is backing.

***

### logger

```ts
logger: FillerLogger;
```

Defined in: [packages/sdk/src/bond/client.ts:68](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/bond/client.ts#L68)

***

### publicClient

```ts
publicClient: unknown;
```

Defined in: [packages/sdk/src/bond/client.ts:65](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/bond/client.ts#L65)

viem `PublicClient` — used for reads.

***

### walletClient

```ts
walletClient: unknown;
```

Defined in: [packages/sdk/src/bond/client.ts:67](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/bond/client.ts#L67)

viem `WalletClient` — used for writes.
