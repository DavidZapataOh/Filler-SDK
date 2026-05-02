[@filler-sdk/sdk](../../README.md) / [testing](../README.md) / createAnvilFiller

# Function: createAnvilFiller()

```ts
function createAnvilFiller(anvil, opts?): Filler;
```

Defined in: [packages/sdk/src/testing/anvil.ts:237](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/testing/anvil.ts#L237)

Build a `Filler` whose viem transports point at the supplied Anvil. Uses
the `createFillerFromPrivateKey` factory + Anvil's well-known dev keys.

**Important**: this Filler doesn't deploy the Filler.sol / FillerBond.sol
contracts to the anvil instance. The caller is responsible for deploying
(typically via a `forge script` invocation in the test setup) and passing
the resolved addresses via `opts.addresses`. Without addresses, the Filler
points at placeholder `0x000…dEaD` addresses and any chain call reverts.

## Parameters

### anvil

[`AnvilHandle`](../interfaces/AnvilHandle.md)

### opts?

[`CreateAnvilFillerOptions`](../interfaces/CreateAnvilFillerOptions.md) = `&#123;&#125;`

## Returns

[`Filler`](../../index/interfaces/Filler.md)
