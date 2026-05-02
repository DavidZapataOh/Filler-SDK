[@filler-sdk/sdk](../../README.md) / [testing](../README.md) / KeeperHubClientShape

# Interface: KeeperHubClientShape

Defined in: [packages/sdk/src/testing/mocks.ts:171](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/testing/mocks.ts#L171)

KeeperHubClient is a class, not an interface, so we expose the structural
shape that `FillEngine` actually uses (`submitFill` only) — duck-typed to
the real client. Pass via `createMockFiller(&#123; config: &#123; keeperHub: ... &#125;&#125;)`
is NOT how the engine accesses it; the real plumbing is `FillEngine.#keeperHub`
which is set at construction. For unit tests of the engine, pass this mock
directly to `new FillEngine(&#123; ..., keeperHub: createMockKeeperHubClient() &#125;)`.

## Properties

### getStatus?

```ts
optional getStatus?: Mock<Procedure | Constructable>;
```

Defined in: [packages/sdk/src/testing/mocks.ts:173](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/testing/mocks.ts#L173)

***

### submitFill

```ts
submitFill: Mock<Procedure | Constructable>;
```

Defined in: [packages/sdk/src/testing/mocks.ts:172](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/packages/sdk/src/testing/mocks.ts#L172)
