[@filler-sdk/sdk](../../README.md) / [index](../README.md) / createFillerFromPrivateKey

# Function: createFillerFromPrivateKey()

```ts
function createFillerFromPrivateKey(input): Filler;
```

Defined in: [packages/sdk/src/createFiller.ts:269](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/createFiller.ts#L269)

Build a `Filler` handle from a private key + RPC URL. The SDK constructs
viem `PublicClient` + `WalletClient` internally; private key never crosses
a logger boundary (Pino redaction in `logger.ts` strips `privateKey` paths
by default).

Use this for: tests, CI, the `create-filler` starter, quick spikes.
For production solvers: use `createFiller` with your own viem clients.

## Parameters

### input

[`CreateFillerFromPrivateKeyConfig`](../interfaces/CreateFillerFromPrivateKeyConfig.md)

## Returns

[`Filler`](../interfaces/Filler.md)
