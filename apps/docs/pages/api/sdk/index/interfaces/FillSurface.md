[@filler-sdk/sdk](../../README.md) / [index](../README.md) / FillSurface

# Interface: FillSurface

Defined in: [packages/sdk/src/types.ts:493](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L493)

## Methods

### execute()

```ts
execute(intent, params): Promise<FillResult>;
```

Defined in: [packages/sdk/src/types.ts:495](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L495)

Run a fill end-to-end: simulate → sign → broadcast → wait for receipt.

#### Parameters

##### intent

[`Intent`](Intent.md)

##### params

[`FillParams`](FillParams.md)

#### Returns

`Promise`&lt;[`FillResult`](FillResult.md)&gt;

***

### simulate()

```ts
simulate(intent, params): Promise<SimulationResult>;
```

Defined in: [packages/sdk/src/types.ts:497](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L497)

Pre-flight a fill (eth_call against the latest block).

#### Parameters

##### intent

[`Intent`](Intent.md)

##### params

[`FillParams`](FillParams.md)

#### Returns

`Promise`&lt;[`SimulationResult`](SimulationResult.md)&gt;
