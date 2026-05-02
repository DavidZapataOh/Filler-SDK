[@filler-sdk/sdk](../../README.md) / [index](../README.md) / getDeployedAddresses

# Function: getDeployedAddresses()

```ts
function getDeployedAddresses(chain, overrides?): ChainDeployedAddresses;
```

Defined in: [packages/sdk/src/chains.ts:271](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/chains.ts#L271)

Resolve deployed addresses for a chain, with optional per-call overrides.
Overrides are merged on top of the canonical map — useful for testnets,
staging deployments, and the bond/filler contracts (which are not yet
deployed on mainnets at the time of this SDK's v0).

## Parameters

### chain

  \| [`ChainId`](../type-aliases/ChainId.md)
  \| [`ChainName`](../type-aliases/ChainName.md)

### overrides?

`Partial`&lt;[`ChainDeployedAddresses`](../interfaces/ChainDeployedAddresses.md)&gt; = `&#123;&#125;`

## Returns

[`ChainDeployedAddresses`](../interfaces/ChainDeployedAddresses.md)
