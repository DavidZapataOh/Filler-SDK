[@filler-sdk/sdk](../../README.md) / [testing](../README.md) / StartAnvilOptions

# Interface: StartAnvilOptions

Defined in: [packages/sdk/src/testing/anvil.ts:62](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/testing/anvil.ts#L62)

## Properties

### accounts?

```ts
optional accounts?: number;
```

Defined in: [packages/sdk/src/testing/anvil.ts:72](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/testing/anvil.ts#L72)

Number of dev accounts. Default 10.

***

### balance?

```ts
optional balance?: number;
```

Defined in: [packages/sdk/src/testing/anvil.ts:74](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/testing/anvil.ts#L74)

Initial ETH balance per dev account, in ETH (whole units). Default 10000.

***

### blockTime?

```ts
optional blockTime?: number;
```

Defined in: [packages/sdk/src/testing/anvil.ts:70](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/testing/anvil.ts#L70)

Auto-mine block time in seconds. Default: instant mining.

***

### forkBlockNumber?

```ts
optional forkBlockNumber?: bigint;
```

Defined in: [packages/sdk/src/testing/anvil.ts:68](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/testing/anvil.ts#L68)

Fork-block override. Useful for deterministic state.

***

### forkUrl?

```ts
optional forkUrl?: string;
```

Defined in: [packages/sdk/src/testing/anvil.ts:66](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/testing/anvil.ts#L66)

Fork URL. When set, Anvil starts as `--fork-url <url>`.

***

### port?

```ts
optional port?: number;
```

Defined in: [packages/sdk/src/testing/anvil.ts:64](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/testing/anvil.ts#L64)

TCP port. Default 8545.

***

### silent?

```ts
optional silent?: boolean;
```

Defined in: [packages/sdk/src/testing/anvil.ts:76](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/testing/anvil.ts#L76)

Mute stdout (still listened to for the ready signal). Default true.
