[@filler-sdk/sdk](../../README.md) / [index](../README.md) / IntentSurface

# Interface: IntentSurface

Defined in: [packages/sdk/src/types.ts:478](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L478)

## Methods

### list()

```ts
list(filter?): Promise<readonly Intent[]>;
```

Defined in: [packages/sdk/src/types.ts:490](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L490)

Snapshot the current open-intent set without subscribing.

#### Parameters

##### filter?

[`IntentFilter`](../type-aliases/IntentFilter.md)

#### Returns

`Promise`&lt;readonly [`Intent`](Intent.md)[]&gt;

***

### subscribe()

```ts
subscribe(filter, onIntent): () => void;
```

Defined in: [packages/sdk/src/types.ts:485](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L485)

Subscribe to intents matching `filter`. The handler may be async — the
stream awaits it sequentially (back-pressure-safe). Errors thrown by the
handler are caught + logged, never killing the subscription.
Returns an unsubscribe function (idempotent).

#### Parameters

##### filter

[`IntentFilter`](../type-aliases/IntentFilter.md)

##### onIntent

(`i`) => `void` \| `Promise`&lt;`void`&gt;

#### Returns

() => `void`
