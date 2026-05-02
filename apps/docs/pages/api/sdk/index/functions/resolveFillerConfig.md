[@filler-sdk/sdk](../../README.md) / [index](../README.md) / resolveFillerConfig

# Function: resolveFillerConfig()

```ts
function resolveFillerConfig(input): ResolvedFillerConfig;
```

Defined in: [packages/sdk/src/createFiller.ts:208](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/createFiller.ts#L208)

Resolve a user-supplied `FillerConfig` into the SDK's internal
`ResolvedFillerConfig`. Pure — no I/O. Throws `ConfigInvalidError` with a
Zod issue list on failure.

## Parameters

### input

[`FillerConfig`](../interfaces/FillerConfig.md)

## Returns

[`ResolvedFillerConfig`](../interfaces/ResolvedFillerConfig.md)
