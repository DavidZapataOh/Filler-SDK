[@filler-sdk/sdk](../../README.md) / [index](../README.md) / FillerTransport

# Interface: FillerTransport

Defined in: [packages/sdk/src/types.ts:443](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L443)

Transport bag. Required clients are typed as `unknown` here to keep the
SDK's public surface free of viem's deep generic graph; `createFiller`
(Plan 02) narrows them to `PublicClient` + `WalletClient` with a runtime
brand check. This is identical to how wagmi v2 types its config.

## Properties

### publicClient

```ts
publicClient: unknown;
```

Defined in: [packages/sdk/src/types.ts:444](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L444)

***

### walletClient

```ts
walletClient: unknown;
```

Defined in: [packages/sdk/src/types.ts:445](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L445)
