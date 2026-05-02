[@filler-sdk/sdk](../../README.md) / [index](../README.md) / Filler

# Interface: Filler

Defined in: [packages/sdk/src/types.ts:235](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L235)

The handle returned by `createFiller`.

Two equivalent ways to drive it:

  1. Grouped surfaces — explicit + tree-shake friendly:
       filler.intents.subscribe(filter, onIntent)
       filler.fills.execute(intent, params)
       filler.indexer.depth(query)

  2. Flat surface — closer to legacy 1inch-fusion ergonomics, easier for
     tutorials + the `create-filler` CLI starter:
       filler.subscribeIntents(predicate, onIntent)
       filler.prepareFill(intent)
       filler.submitFill(intent, params, opts)

Both routes hit the same internal `IntentStream` / `FillEngine` /
`IndexerClient`, so picking one is purely a style choice.

## Properties

### account

```ts
readonly account: `0x${string}`;
```

Defined in: [packages/sdk/src/types.ts:239](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L239)

Solver-controlled EOA / Safe that signs fills.

***

### bond

```ts
readonly bond: BondClientHandle;
```

Defined in: [packages/sdk/src/types.ts:252](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L252)

Bond client surface — stake / unstake / withdraw against `FillerBond`.
Typed in Plan 07.

***

### chainId

```ts
readonly chainId: ChainId;
```

Defined in: [packages/sdk/src/types.ts:237](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L237)

Configured chain id.

***

### config

```ts
readonly config: ResolvedFillerConfig;
```

Defined in: [packages/sdk/src/types.ts:241](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L241)

Read-only access to the SDK's resolved config.

***

### fills

```ts
readonly fills: FillSurface;
```

Defined in: [packages/sdk/src/types.ts:245](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L245)

Fill engine surface — fully typed in Plan 04.

***

### indexer

```ts
readonly indexer: IndexerSurface;
```

Defined in: [packages/sdk/src/types.ts:247](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L247)

JIT-hints HTTP client — typed in Plan 06.

***

### intents

```ts
readonly intents: IntentSurface;
```

Defined in: [packages/sdk/src/types.ts:243](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L243)

Intent stream surface — fully typed in Plan 03.

## Methods

### close()

```ts
close(): Promise<void>;
```

Defined in: [packages/sdk/src/types.ts:290](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L290)

Alias for `shutdown` — matches the Plan 02 spec ergonomics.

#### Returns

`Promise`&lt;`void`&gt;

***

### prepareFill()

```ts
prepareFill(intent): Promise<FillParams | null>;
```

Defined in: [packages/sdk/src/types.ts:273](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L273)

Build the `FillParams` for an intent, returning `null` if no profitable
fill exists (slippage budget exhausted, depth too thin, etc.). Wraps
`fills.simulate` + tick-calibration logic. Implementation lands in
Plan 04 + Plan 05.

#### Parameters

##### intent

[`Intent`](Intent.md)

#### Returns

`Promise`&lt;[`FillParams`](FillParams.md) \| `null`&gt;

***

### shutdown()

```ts
shutdown(): Promise<void>;
```

Defined in: [packages/sdk/src/types.ts:287](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L287)

Stop all background work (intent stream, polling). Idempotent.

#### Returns

`Promise`&lt;`void`&gt;

***

### submitFill()

```ts
submitFill(
   intent, 
   params, 
   options?): Promise<FillResult>;
```

Defined in: [packages/sdk/src/types.ts:280](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L280)

End-to-end fill: simulate → sign → broadcast → wait for receipt. Same as
`fills.execute`, but accepts a `SubmitFillOptions` bag for routing /
gas multiplier / KeeperHub override.

#### Parameters

##### intent

[`Intent`](Intent.md)

##### params

[`FillParams`](FillParams.md)

##### options?

[`SubmitFillOptions`](SubmitFillOptions.md)

#### Returns

`Promise`&lt;[`FillResult`](FillResult.md)&gt;

***

### subscribeIntents()

```ts
subscribeIntents(filter, onIntent): () => void;
```

Defined in: [packages/sdk/src/types.ts:262](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L262)

Subscribe to intents matching `filter`. Same semantics as
`intents.subscribe(filter, onIntent)`. Errors thrown by `onIntent` are
caught + logged so a bad handler doesn't tear down the stream.
Returns an unsubscribe function.

#### Parameters

##### filter

[`IntentFilter`](../type-aliases/IntentFilter.md)

##### onIntent

(`intent`) => `void` \| `Promise`&lt;`void`&gt;

#### Returns

() => `void`
