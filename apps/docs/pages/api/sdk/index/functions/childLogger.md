[@filler-sdk/sdk](../../README.md) / [index](../README.md) / childLogger

# Function: childLogger()

```ts
function childLogger(parent, bindings): FillerLogger;
```

Defined in: [packages/sdk/src/logger.ts:62](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/logger.ts#L62)

Adapt any `FillerLogger` into a child logger with extra bindings.

## Parameters

### parent

[`FillerLogger`](../interfaces/FillerLogger.md)

### bindings

`Record`&lt;`string`, `unknown`&gt;

## Returns

[`FillerLogger`](../interfaces/FillerLogger.md)
