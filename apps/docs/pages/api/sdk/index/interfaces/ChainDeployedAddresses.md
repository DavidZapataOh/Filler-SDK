[@filler-sdk/sdk](../../README.md) / [index](../README.md) / ChainDeployedAddresses

# Interface: ChainDeployedAddresses

Defined in: [packages/sdk/src/chains.ts:58](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/chains.ts#L58)

## Properties

### filler

```ts
filler: `0x${string}`;
```

Defined in: [packages/sdk/src/chains.ts:73](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/chains.ts#L73)

Filler contract (this SDK's executor — see contracts/src/Filler.sol).
Empty until Sprint 01 deploy script lands real addresses; operators
MUST override per-environment.

***

### fillerBond

```ts
fillerBond: `0x${string}`;
```

Defined in: [packages/sdk/src/chains.ts:78](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/chains.ts#L78)

FillerBond contract (slashable bond — see contracts/src/FillerBond.sol).
Same caveat as `filler`.

***

### permit2

```ts
permit2: `0x${string}`;
```

Defined in: [packages/sdk/src/chains.ts:62](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/chains.ts#L62)

Permit2 — same address on every chain.

***

### poolManager

```ts
poolManager: `0x${string}`;
```

Defined in: [packages/sdk/src/chains.ts:60](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/chains.ts#L60)

Uniswap v4 PoolManager.

***

### reactor

```ts
reactor: `0x${string}`;
```

Defined in: [packages/sdk/src/chains.ts:67](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/chains.ts#L67)

UniswapX Reactor (V2 dutch order). When the SDK adds support for V3 or
exclusive-dutch-with-priority orders we'll add a separate field.
