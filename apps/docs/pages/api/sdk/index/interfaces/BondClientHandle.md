[@filler-sdk/sdk](../../README.md) / [index](../README.md) / BondClientHandle

# Interface: BondClientHandle

Defined in: [packages/sdk/src/types.ts:329](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L329)

Minimum public surface of the BondClient — the actual class lives in
`src/bond/client.ts` and is exported from `@filler-sdk/sdk/bond`. We
reference its handle from the top-level `Filler` so users can write
`filler.bond.totalStake()` without a second import.

Each `BondClient` is scoped to a single `(fillerContract, account)` pair —
the `account` is the staker, the `fillerContract` is the `Filler.sol`
deployment whose bond pool the staker is contributing to.

## Properties

### account

```ts
readonly account: `0x${string}`;
```

Defined in: [packages/sdk/src/types.ts:334](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L334)

***

### bondContract

```ts
readonly bondContract: `0x${string}`;
```

Defined in: [packages/sdk/src/types.ts:331](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L331)

***

### chainId

```ts
readonly chainId: ChainId;
```

Defined in: [packages/sdk/src/types.ts:330](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L330)

***

### fillerContract

```ts
readonly fillerContract: `0x${string}`;
```

Defined in: [packages/sdk/src/types.ts:333](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L333)

The `Filler.sol` deployment this bond is backing.

## Methods

### activeStake()

```ts
activeStake(): Promise<bigint>;
```

Defined in: [packages/sdk/src/types.ts:338](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L338)

Stake currently usable as collateral (`stakeOf(filler, account)`).

#### Returns

`Promise`&lt;`bigint`&gt;

***

### pendingUnstake()

```ts
pendingUnstake(): Promise<bigint>;
```

Defined in: [packages/sdk/src/types.ts:340](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L340)

Stake currently in the unstake-cooldown window.

#### Returns

`Promise`&lt;`bigint`&gt;

***

### requestUnstake()

```ts
requestUnstake(amount): Promise<`0x${string}`>;
```

Defined in: [packages/sdk/src/types.ts:350](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L350)

Begin the unstake cooldown for `amount`. Returns the tx hash.

#### Parameters

##### amount

`bigint`

#### Returns

`Promise`&lt;`` `0x$&#123;string&#125;` ``&gt;

***

### slashedTotal()

```ts
slashedTotal(): Promise<bigint>;
```

Defined in: [packages/sdk/src/types.ts:346](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L346)

Global slashed amount across ALL fillers on this bond contract — useful
for monitoring + UI badges. Per-filler / per-staker slashing isn't
tracked at the contract level (v0 design).

#### Returns

`Promise`&lt;`bigint`&gt;

***

### stake()

```ts
stake(amount): Promise<`0x${string}`>;
```

Defined in: [packages/sdk/src/types.ts:348](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L348)

Stake ETH to back `fillerContract`. Returns the tx hash.

#### Parameters

##### amount

`bigint`

#### Returns

`Promise`&lt;`` `0x$&#123;string&#125;` ``&gt;

***

### totalStake()

```ts
totalStake(): Promise<bigint>;
```

Defined in: [packages/sdk/src/types.ts:336](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L336)

Stake total for `(fillerContract, account)` (active + pending unstake).

#### Returns

`Promise`&lt;`bigint`&gt;

***

### withdraw()

```ts
withdraw(): Promise<`0x${string}`>;
```

Defined in: [packages/sdk/src/types.ts:352](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/types.ts#L352)

After cooldown, withdraw the unstaked amount. Returns the tx hash.

#### Returns

`Promise`&lt;`` `0x$&#123;string&#125;` ``&gt;
