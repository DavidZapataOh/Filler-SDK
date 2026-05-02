[@filler-sdk/sdk](../../README.md) / [index](../README.md) / SimulationResult

# Interface: SimulationResult

Defined in: [packages/sdk/src/types.ts:500](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L500)

## Properties

### gasEstimate?

```ts
optional gasEstimate?: bigint;
```

Defined in: [packages/sdk/src/types.ts:504](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L504)

Estimated gas — undefined when ok=false.

***

### ok

```ts
ok: boolean;
```

Defined in: [packages/sdk/src/types.ts:502](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L502)

True if the simulated tx would succeed.

***

### revertReason?

```ts
optional revertReason?: string;
```

Defined in: [packages/sdk/src/types.ts:506](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L506)

Decoded revert reason, when available.
