# FEEDBACK.md — Uniswap Foundation

> Developer feedback report from building **Filler SDK** during ETHGlobal OpenAgents.
>
> Prize-eligibility document for the [Uniswap Foundation track](https://ethglobal.com/events/openagents/prizes#uniswap). Per the track's qualification requirement: *"Tell us everything about your builder experience with the Uniswap API and Developer Platform."*

---

## TL;DR

We built **Filler SDK** — open-source MIT, three TypeScript packages + two Solidity contracts, deploys vertical UniswapX solvers in `npm install`. The pitch: lower the 4-week barrier-to-first-fill for the long-tail of solver verticals (treasury rebalances, hook-specific solvers, LVR-aware strategies) that institutional desks (Wintermute, SCP, Propeller) don't economically reach.

The 10 items below are the highest-leverage frictions we encountered — the ones that, if any one were addressed, would materially improve the next builder's experience. Each passes our quality bar:

- **Specific** — names the exact endpoint, file, contract, or commit
- **Reproducible** — copy-paste reproducer included; a maintainer can verify in 5 minutes
- **Actionable** — the suggested change is implementable, not aspirational
- **Honest** — "HIGH" criticality only when truly blocks a category; no hype
- **Constructive** — proposal-shaped, not complaint-shaped

We hope this is useful.

---

## How this document is organized

Each of the 10 items below has 4 sections:

1. **Friction observed** — the thing that was hard
2. **Reproducer** — copy-paste verification
3. **Suggested change** — concrete diff or new endpoint
4. **Criticality** — HIGH / MEDIUM / LOW for solver builders

After the 10 items: a section on **what we'd contribute back to the ecosystem** (open-source contributions on offer to the Foundation).

---

## 1. UniswapX has zero testnet deployments — every team building UniswapX-aware agents hits a day-one wall

**Friction observed**: We audited the four candidate testnets (Sepolia, Unichain Sepolia, Base Sepolia, Arbitrum Sepolia) for deployed UniswapX Reactor coverage. Result: **none of the canonical mainnet UniswapX Reactor addresses** have bytecode on **any** of the four testnets. Cross-checked V2 Dutch (`0x00000011f84b…289be`), Priority Reactor (`0x00000006021a…956e37`), V1 Exclusive Dutch (`0x6000da47…645C4`), DutchV3 (`0xB274d5F4…04a87c`) — every cross-chain probe returned `0x` (empty bytecode). v4 PoolManager + Permit2 ARE deployed on every chain; only UniswapX is absent.

This forced our entire end-to-end demo to pivot from testnet to mainnet fork — a strictly stronger demo path (real protocol, real contracts) but a painful day-one surprise for any team or new builder.

**Reproducer**:

```bash
$ cast code 0x00000011f84b9aa48e5f8aa8b9897600006289be \
  --rpc-url https://ethereum-sepolia-rpc.publicnode.com
0x

$ cast code 0x00000006021a6Bce796be7ba509BBBA71e956e37 \
  --rpc-url https://sepolia.unichain.org
0x

# Same result for Base Sepolia + Arbitrum Sepolia
```

**Suggested change**: Deploy at least one Reactor variant (V2 Dutch is sufficient) on **Unichain Sepolia** as the canonical test environment. Pin the address in [the deployments page](https://docs.uniswap.org/contracts/uniswapx/v2/deployments) with explicit "testnet" call-out. Include a Sepolia-funded test wallet operators can request from a faucet.

Or, second-best: a one-pager titled "How to test UniswapX without testnet deployments" on docs.uniswap.org pointing at mainnet fork as the canonical path. We'd happily contribute the recipe.

**Criticality**: **HIGH** for any team building a UniswapX-aware agent on day 1. Cost: ~4 hours per team to hit the wall + pivot to mainnet fork.

---

## 2. UniswapX Trading API has `POST /v1/order` (submit) and `GET /orders` (status) but no public endpoint for solvers to discover *pending* fillable intents

**Friction observed**: The Trading API today documents two UniswapX-related endpoints:

- **`POST /v1/order`** — a swapper submits a signed UniswapX order to the filler network
- **`GET /orders`** — a swapper monitors status of their submitted orders (filled, expired, etc.)

What's missing is the **third side of the triangle**: an endpoint a *solver* can hit to discover **open, signed-but-not-yet-filled** intents that match its filter (chainId, reactor, pair, size). Without that, a permissionless solver has no public way to find work — only institutional fillers in the relayer's allowlist see the order book.

This is the gap between "anyone can run a UniswapX solver" (the protocol's design intent) and "anyone can run a UniswapX solver and actually find orders to fill" (today's reality).

**Reproducer**:

```bash
# Submit (documented):
$ curl -X POST 'https://trade-api.gateway.uniswap.org/v1/order' \
    -d '{ "encodedOrder": "...", "signature": "..." }'
# → accepts; broadcasts to filler network

# Status (documented):
$ curl 'https://trade-api.gateway.uniswap.org/v1/orders?orderHashes=0x...'
# → returns status

# Discover pending (NOT documented):
$ curl 'https://trade-api.gateway.uniswap.org/v1/orders?orderStatus=open&minSizeUsd=1000'
HTTP/2 401  (or 404, or empty result depending on auth state)
```

Search [`docs.uniswap.org/api/trading`](https://docs.uniswap.org/api/trading) and the [Trading API integration guide](https://developers.uniswap.org/api/trading/integration-guide) for a documented "stream open orders" or "list pending intents" endpoint — present search returns no public documentation of one.

**Suggested change**: Document a `GET /v1/orders?orderStatus=open` (or SSE equivalent) endpoint with filtering by `chainId`, `reactor`, `minSizeUsd`, `pair`, etc. If access control is needed for institutional fillers vs. permissionless solvers, document the auth tiers. Either way, formalize the API surface so the open-source ecosystem can build:

```yaml
# Trading API OpenAPI addition
/v1/orders/stream:
  get:
    summary: SSE stream of pending UniswapX intents matching filter
    parameters:
      - name: chainId
      - name: reactor
      - name: minSizeUsd
    responses:
      200:
        content: { text/event-stream: { ... Intent schema ... } }
```

**Criticality**: **HIGH** — this is the single largest gap between UniswapX's design ("permissionless filler network") and current implementation ("permissionless to submit, allowlisted to discover"). Closing it would unblock the entire vertical-solver category.

---

## 3. The canonical TypeScript `TickMath` (in `@uniswap/v3-sdk`, reused by `@uniswap/v4-sdk`) uses JSBI — modern viem/Bun-based codebases need to convert on every call

**Friction observed**: `@uniswap/v4-sdk` v2.0.0 imports `TickMath` from `@uniswap/v3-sdk` (verified in [`sdks/v4-sdk/src/utils/priceTickConversions.ts`](https://github.com/Uniswap/sdks/blob/main/sdks/v4-sdk/src/utils/priceTickConversions.ts)). Source visible in [`sdks/v3-sdk/src/utils/tickMath.ts`](https://github.com/Uniswap/sdks/blob/main/sdks/v3-sdk/src/utils/tickMath.ts).

The implementation is fine and battle-tested — but it returns `JSBI` instances rather than native `bigint`. JSBI ([originally a polyfill for browsers without BigInt support](https://github.com/GoogleChromeLabs/jsbi)) is a legacy choice now that **all supported Node.js + Bun + every modern browser have native `bigint`**. Every modern viem-based codebase has to wrap the calls or convert:

```ts
import { TickMath } from '@uniswap/v3-sdk';
import JSBI from 'jsbi';

const sqrtJSBI = TickMath.getSqrtRatioAtTick(199_860);
const sqrtBigInt = BigInt(sqrtJSBI.toString());  // every call, every team
```

This forces every consumer to pull JSBI as a transitive dep (~25 KB) just to interop with the rest of their bigint-native codebase.

**Reproducer**:

```bash
$ npm view @uniswap/v3-sdk dependencies
# jsbi: ^3.2.5
$ grep -r "JSBI" node_modules/@uniswap/v3-sdk/src/
# every TickMath function signature returns or accepts JSBI
```

**Suggested change**: Either:

1. **Ship a `@uniswap/v4-tick-math-bigint`** zero-dep package using native `bigint` throughout. (Or just `@uniswap/v4-tick-math` — fresh package, fresh API.)
2. **Add a v2 entry-point** to `@uniswap/v3-sdk` / `@uniswap/v4-sdk` exposing the same TickMath ops with `bigint` types. Backward-compatible.

We'd happily contribute the bigint port as the starting commit (we have one in our indexer that we've fuzz-tested against the Solidity reference).

**Criticality**: **MEDIUM** — works today via JSBI conversion. Friction is per-call boilerplate + an unnecessary 25 KB dep in any bigint-native consumer's bundle.

---

## 4. V2DutchOrderReactor's mandatory cosigner trap — empty cosignature reverts with empty data, the SDK builder accepts the broken shape silently

**Friction observed**: Building an "open" UniswapX V2 Dutch order (no RFQ cosigner involved) seemed natural with the official SDK:

```ts
const builder = new V2DutchOrderBuilder(chainId, reactor, permit2)
  .swapper(swapper.address)
  .input({...}).output({...})
  .cosigner('0x0000000000000000000000000000000000000000')   // "open" — natural
  .cosignature('0x')                                          // no cosigner = no sig
  .build();
```

The SDK accepts this silently. Local sig recovery passes. Permit2 `DOMAIN_SEPARATOR` matches. Then `Filler.execute → Reactor.executeWithCallback` reverts with **empty data** (no selector, no message).

Root cause (only visible after reading the verified Reactor source on Etherscan): `_validateOrder` runs **unconditionally** — there is no short-circuit when `cosigner == address(0)`. With `cosignature == "0x"`, `abi.decode(cosignature, (bytes32, bytes32))` panics with empty revert data BEFORE the typed `InvalidCosignature()` error fires. So the failure mode is doubly hidden: the protocol design requires a cosignature, AND the wrong-shape error swallows the protocol-level intent.

We spent ~4 hours diagnosing this through `cast run` traces before pivoting to **self-cosign** (the swapper signs as both swapper AND cosigner — legal because cosigner can be any address).

**Reproducer**:

```bash
# Build an open order with cosigner=0x0+sig=0x via the SDK, submit on a fork:
bun packages/sdk/scripts/submit-intent.ts --input USDC --output WETH --size 100 --submit
# → tx mined, status: reverted, empty revert data
# → cast run <txHash> shows revert inside Reactor.executeWithCallback with no selector
```

**Suggested change** (in priority order):

1. **`@uniswap/uniswapx-sdk` `V2DutchOrderBuilder`**: when `cosigner == address(0)` AND `cosignature == "0x"`, throw at `.build()`:
   ```
   V2DutchOrderReactor requires a cosignature even for open orders.
   To self-cosign, use `CosignedV2DutchOrder.fromUnsignedOrder(unsigned, cosignerData, cosignerSig)`.
   To use Uniswap's RFQ cosigner service, fetch from /v2/quote.
   ```
   This is a 5-line builder check that saves every team 2-4 hours of `cast run` archaeology.
2. **`V2DutchOrderReactor` on-chain**: replace the `abi.decode(cosignature, (bytes32, bytes32))` on possibly-empty bytes with `if (cosignature.length != 65) revert InvalidCosignatureLength();` BEFORE the decode. ~30 gas, replaces empty-revert-data with a typed error.
3. **Docs**: the [V2 Dutch Order docs](https://docs.uniswap.org/contracts/uniswapx/guides/dutchv2) describe the cosigner role but don't say "MANDATORY for every order — `cosigner=address(0)` will revert in `_validateOrder`."

**Criticality**: **HIGH** — this is exactly the kind of issue the hackathon track is designed to surface. UniswapX V2 integration is the prize-track ask; hitting this on day 1 = lost day for every team that doesn't read the verified Reactor source.

---

## 5. v4 mainnet ETH adoption gap — most-liquid PoolManager is Unichain, mainnet ETH is empty

**Friction observed**: While auditing pool liquidity for the E2E demo, we discovered the v4 mainnet ETH PoolManager has effectively zero on-chain activity:

| Chain | PoolManager | Swap events / 5K blocks |
|---|---|---|
| Mainnet ETH | `0x000000000004444c5dc75cb358380d2e3de08a90` | **0** (verified on 2 RPCs) |
| Base | `0x498581ff718922c3f8e6a244956af099b2652b2b` | 0 |
| Unichain mainnet | `0x1f98400000000000000000000000000000000004` | **363** |

Liquidity migrated to Unichain (Uniswap's own L2) — by design. But the **public communication** doesn't reflect this. Public posts cite "$3B in v4 within first week" without per-chain breakdown. The [v4 deployments page](https://docs.uniswap.org/contracts/v4/deployments) lists addresses on every chain without flagging which are active vs dormant.

We almost wasted a day forking mainnet ETH for the demo before the pool-activity audit revealed Unichain was where the action was.

**Reproducer**: one-line audit per chain.

```bash
$ cast logs --address 0x000000000004444c5dc75cb358380d2e3de08a90 \
    --from-block <latest-50k> --to-block latest \
    0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f \
    --rpc-url https://ethereum.publicnode.com
# → 0 Swap events in last 50K blocks (~7 days)
```

**Suggested change**:

1. **Docs**: a "v4 chain adoption snapshot" page, refreshed daily or weekly, with per-chain TVL + swap count + pool count. Honest signal: "Unichain is the live v4 chain; mainnet ETH and Base v4 are deployed but pre-liquidity-migration."
2. **Trading API**: expose `/v4/pools?chainId=<n>&minTvl=<x>` so agent builders can pick a chain that has fillable inventory.
3. **`@filler-sdk/sdk` (we'd ship)**: `getActivePools(chainId)` helper that queries the indexer (`@filler-sdk/jit-hints`) and returns pools with non-zero swap activity. This becomes a default pre-flight check for new solvers.

**Criticality**: **HIGH** for teams + new builders choosing target chains. Cost: a day's worth of pivoting.

---

## 6. UniswapX Trading API has no documented private-routing hook — every solver builds its own MEV-protected adapter

**Friction observed**: Production solvers MUST route fills through MEV-protected channels (Flashbots, Eden, MEV-Share, KeeperHub). The `@uniswap/uniswapx-sdk` exposes `submitFill(intent, params)` for direct public-mempool submission, but no parameter, header, or documented pattern for routing to a private mempool.

Every solver team rebuilds the same MEV-protected broadcast adapter. We built ours via `@filler-sdk/sdk/keeperhub` — a separate sub-path with its own `KeeperHubClient`.

**Reproducer**: search the [uniswap-ai repo](https://github.com/Uniswap/uniswap-ai) for "Flashbots" / "private routing" / "MEV protection" — minimal coverage. The official SDK README likewise.

**Suggested change**: Add `submitOptions.privateRouting` to the SDK and document the canonical adapters:

```ts
await filler.submitFill(intent, params, {
  privateRouting: {
    provider: 'flashbots' | 'eden' | 'mev-share' | 'keeperhub',
    config: { ... }
  }
});
```

Plus an `agent_security.md` chapter to `uniswap-ai/uniswap-trading` covering:
- Private mempool routing (which provider when)
- Slippage bounds + revert thresholds
- Attribution analysis post-fill
- Recommended setup for autonomous (agent-operated) solvers

**Criticality**: **HIGH** for production solvers. Agents auto-submitting without MEV protection bleed.

---

## 7. UniswapX has no `/simulate` endpoint — solvers eat failed-broadcast cycles to verify a fill before submission

**Friction observed**: To verify a fill will succeed before broadcasting, a solver today must:

1. Construct the full `Filler.execute` calldata (intent + cosignature + Permit2 + FillParams)
2. Run an `eth_call` against the deployed Filler contract
3. If it reverts, decode the typed error from the raw 4-byte selector
4. Iterate

This works but burns RPC quota + latency on every quote-stage check. It also misses failure modes the chain itself might hit (mempool reordering, MEV sandwich pre-empting the fill, gas-spike-induced revert) that an `eth_call` against current state can't predict.

A `/simulate` endpoint that takes intent + fill params and returns expected outcome — including gas estimate and basic MEV-risk score — would save many failed-submit cycles and make the SDK's `prepareFill → submitFill` flow safer.

**Reproducer**:

```bash
# Today's verification path:
$ cast call $FILLER 'execute((bytes,bytes),bytes)' \
  '(<orderBytes>,<sig>)' '<callbackData>' \
  --rpc-url $RPC --from $SOLVER --trace
# → succeeds or reverts; no gas estimate; no MEV awareness
```

**Suggested change**: Trading API endpoint:

```yaml
POST /v1/uniswapx/simulate
{
  "intent": { ... SignedOrder ... },
  "fillParams": { ... FillParams ... },
  "blockNumber": "latest"  // or specific block for replay
}

Response:
{
  "ok": true,
  "expectedGas": 547321,
  "expectedSlippageBps": 4,
  "predictedRevertReason": null,
  "mevRiskScore": 0.12,
  "currentBlock": 25011023
}
```

The response shape lets the solver decide pre-broadcast whether the fill is worth the gas + MEV exposure.

**Criticality**: **MEDIUM** — quality-of-life, not blocking. Solvers ship without it but burn RPC + miss MEV-risk signal.

---

## 8. UniswapX `Order` log doesn't include `rawOrder` bytes — solvers must reconstruct or fetch separately

**Friction observed**: Solvers indexing UniswapX activity from on-chain logs (essential for backtesting + auditing) must reconstruct each intent's full `rawOrder` calldata from a separate source — the Reactor's `Fill` and `OrderEvent` log topics include `orderHash + swapper + nonce + recipient` but **not the encoded `SignedOrder` bytes**. To reconstruct the full intent (e.g., for replay-mode backtesting against historical fills), solvers must:

1. Index `Fill` events for orderHash
2. Cross-reference against the Trading API (item #2 — undocumented schema)
3. Or run a parallel `eth_getTransactionByHash` lookup on the original `Filler.execute` calldata

Three sources for what should be one log emit.

**Reproducer**:

```solidity
// Reactor's Fill event, current shape:
event Fill(bytes32 indexed orderHash, address indexed filler, address indexed swapper, uint256 nonce);

// What an indexer needs:
event Fill(bytes32 indexed orderHash, address indexed filler, address indexed swapper, uint256 nonce, bytes rawOrder, bytes signature);
```

**Suggested change**: Add `rawOrder` + `signature` to the Reactor's `Fill` event in the next Reactor version. Costs ~1500 gas per event (negligible at fill-tx scale). Solver indexers go from 3-source to 1-source. Backtesting frameworks become trivial.

Or, second-best: a documented `OrderArchive` view contract that maps `orderHash → SignedOrder` for the last N blocks.

**Criticality**: **MEDIUM** — workable today, painful at scale.

---

## 9. v4 `PoolManager.donate()` is `onlyWhenUnlocked` — direct EOA donation is impossible, every team rebuilds the unlock-callback wrapper

**Friction observed**: The LVR-aware vertical (one of our canonical recipes) wants a solver to donate a fraction of captured spread back to in-range LPs. The natural primitive is [`PoolManager.donate(PoolKey, uint256, uint256, bytes)`](https://github.com/Uniswap/v4-core/blob/main/src/PoolManager.sol):

```solidity
function donate(PoolKey memory key, uint256 amount0, uint256 amount1, bytes calldata hookData)
    external
    onlyWhenUnlocked
    noDelegateCall
    returns (BalanceDelta delta)
```

The `onlyWhenUnlocked` modifier means it can only be called from inside an `unlockCallback` (i.e., during a `PoolManager.unlock` flow). An EOA or external contract cannot call it directly. Every solver wanting LP-protective behaviour rolls its own unlock-callback wrapper that includes a donate step — same plumbing every team rebuilds.

**Reproducer**:

```solidity
// EOA (or non-locker contract) attempts donate:
poolManager.donate(poolKey, amount0, amount1, "");
// → reverts: ManagerLocked (the onlyWhenUnlocked modifier check fails)
```

**Suggested change**: Ship a canonical `DonationHelper` contract in [`v4-periphery`](https://github.com/Uniswap/v4-periphery) that wraps `unlock + donate + settle` for any caller. The shape:

```solidity
// v4-periphery/src/DonationHelper.sol
contract DonationHelper is IUnlockCallback {
    function donate(PoolKey calldata key, uint256 amount0, uint256 amount1) external {
        // pull tokens from msg.sender, unlock + call donate inside callback, settle
    }
}
```

Single canonical implementation. Every LVR-aware solver / passive LP hook author imports it. No more per-team unlock-callback boilerplate.

**Criticality**: **MEDIUM** — workable per-team but multiplied across the LVR-aware ecosystem.

---

## 10. Treasury internalisation is undocumented as a UniswapX pattern — despite being the highest-leverage DAO use case

**Friction observed**: The most compelling vertical we found for UniswapX (and the basis for our [hero example](./examples/treasury-rebalance)) is **DAO treasury internalisation**: a DAO running its own solver to fill the DAO's own intents. For a $50M quarterly rebalance, the spread saved (10–30 bps internalised vs. paid to aggregators) is **$50K–$150K per cycle**. A treasury manager running this for a year captures ~$200K–$600K of formerly-leaked value.

We found zero documentation of this pattern in `docs.uniswap.org` or the Trading API guides. The technical primitives all exist (V2 Dutch Reactor, Permit2, the SDK), but the pattern is unsurfaced. Builders looking for "how does my DAO use UniswapX" find quote-and-fill examples, not internalisation patterns.

**Reproducer**: search [docs.uniswap.org](https://docs.uniswap.org) for "treasury internalisation" / "DAO solver" / "spread capture" / "filler your own intents." Minimal coverage. Search [uniswap-ai](https://github.com/Uniswap/uniswap-ai) — same.

**Suggested change**: Add a **DAO Treasury Recipe** chapter to `uniswap-ai/uniswap-trading` covering:
- The economic motivation (linkable: GnosisDAO leaked $700K to oracle-lag arbitrage in 2025; see public Protos coverage)
- The strategy filter (`swapper == DAO_TREASURY`)
- Key/wallet separation requirements (Permit2 nonce isolation between intent-signer and fill-broadcaster)
- Production checklist (audit, multisig, monitoring, inventory)

We'd contribute this chapter directly. Our hero example [`examples/treasury-rebalance`](./examples/treasury-rebalance) is the working reference implementation, MIT-licensed.

**Criticality**: **MEDIUM** — discovery gap. The technical infra works; the marketing/documentation gap means DAOs don't know they can do this until someone writes a recipe.

---

## What we'd contribute back to the ecosystem

If any of the above resonates, we're ready to ship:

1. **`@filler-sdk/jit-hints` indexer** — Ponder-based v4 hook indexer with JIT depth API. MIT-licensed, self-hostable. Could be vendored / forked into a Foundation-blessed reference indexer (Tycho-shape).
2. **`@uniswap/v4-tick-math` initial commit** — our existing TS port (item #3), packaged as the zero-dep canonical TickMath reference, with build-time fuzz tests against the Solidity source.
3. **`@filler-sdk/sdk` Trading API source** — once item #2 (Intent JSON schema) is published, we'd ship `createTradingApiIntentSource(opts)` as a tree-shakable sub-export of our SDK, demonstrating the integration shape.
4. **`agent_security.md` chapter** for `uniswap-ai/uniswap-trading` — covering MEV protection patterns (item #6), private routing, slippage bounds, autonomous-operation recommendations.
5. **DAO Treasury recipe** (item #10) — full walk-through with our hero example as the working reference implementation.
6. **Co-authoring** an "agent posture for UniswapX solvers" position paper alongside Foundation team or a partner DAO — this is the topology we live in for 6+ months and have honest opinions on.

---

## Methodology

We commit to honest, actionable feedback:

- **Specific** — names the exact endpoint, file, contract, or commit
- **Reproducible** — copy-paste reproducer included
- **Actionable** — proposed change is implementable, not aspirational
- **Honest** — no exaggeration; "HIGH" criticality reserved for blockers of categories
- **Constructive** — proposal-shaped, not complaint-shaped

Each item was added when we encountered it in real implementation, not synthesized to fill a quota.

---

## Closing

Filler SDK was built during ETHGlobal OpenAgents for the Uniswap Foundation track. Project repo: [github.com/DavidZapataOh/filler-sdk](https://github.com/DavidZapataOh/filler-sdk). MIT-licensed, immutable contracts, multisig-owned, self-hostable.

We've enjoyed building on this stack. The items above are the price of admission for hard problems with novel primitives — and we think the primitives are good. We hope the items help the next iteration.

— The Filler SDK team, ETHGlobal OpenAgents 2026
