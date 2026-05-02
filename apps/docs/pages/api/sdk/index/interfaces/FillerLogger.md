[@filler-sdk/sdk](../../README.md) / [index](../README.md) / FillerLogger

# Interface: FillerLogger

Defined in: [packages/sdk/src/types.ts:625](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L625)

Minimum surface every logger we accept must implement. Compatible with
`pino`, `console`, `winston`, `tslog`, etc. — solver authors keep their
existing logger.

## Extended by

- [`TestLogger`](../../testing/interfaces/TestLogger.md)

## Methods

### child()?

```ts
optional child(bindings): FillerLogger;
```

Defined in: [packages/sdk/src/types.ts:631](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L631)

#### Parameters

##### bindings

`Record`&lt;`string`, `unknown`&gt;

#### Returns

`FillerLogger`

***

### debug()

```ts
debug(obj, msg?): void;
```

Defined in: [packages/sdk/src/types.ts:627](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L627)

#### Parameters

##### obj

`unknown`

##### msg?

`string`

#### Returns

`void`

***

### error()

```ts
error(obj, msg?): void;
```

Defined in: [packages/sdk/src/types.ts:630](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L630)

#### Parameters

##### obj

`unknown`

##### msg?

`string`

#### Returns

`void`

***

### info()

```ts
info(obj, msg?): void;
```

Defined in: [packages/sdk/src/types.ts:628](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L628)

#### Parameters

##### obj

`unknown`

##### msg?

`string`

#### Returns

`void`

***

### trace()

```ts
trace(obj, msg?): void;
```

Defined in: [packages/sdk/src/types.ts:626](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L626)

#### Parameters

##### obj

`unknown`

##### msg?

`string`

#### Returns

`void`

***

### warn()

```ts
warn(obj, msg?): void;
```

Defined in: [packages/sdk/src/types.ts:629](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L629)

#### Parameters

##### obj

`unknown`

##### msg?

`string`

#### Returns

`void`
