# FEEDBACK.md — Uniswap Foundation

> Developer feedback report from building **Filler SDK** during ETHGlobal OpenAgents (April–May 2026).
>
> Prize-eligibility document for the [Uniswap Foundation track](https://ethglobal.com/events/openagents/prizes#uniswap). Per the track's qualification requirement: *"Tell us everything about your builder experience with the Uniswap API and Developer Platform."*
>
> This is the **submission-grade document**, hand-curated to 10 highest-impact items. The exhaustive 66-item archive lives at [`plans/FEEDBACK.md`](./plans/FEEDBACK.md), accumulated incrementally across 8 sprints — every item with reproducer, suggested change, and criticality.

---

## TL;DR

We built **Filler SDK** — open-source MIT, three TypeScript packages + two Solidity contracts, deploys vertical UniswapX solvers in `npm install`. The pitch: lower the 4-week barrier-to-first-fill for the long-tail of solver verticals (treasury rebalances, hook-specific solvers, LVR-aware strategies) that institutional desks (Wintermute, SCP, Propeller) don't economically reach.

While building, we hit **66 distinct frictions** across the Uniswap developer surface. The 10 most impactful — the ones that would shape the next 6 months of the developer platform if any one were addressed — are detailed below. Each one passes our quality bar:

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

After the 10 items: a section on **what the SDK ships back to the ecosystem** (open-source contributions on offer to the Foundation).

The cross-reference column links to:
- 📂 source files in this repo where we hit the friction
- 📝 sprint progress docs documenting the diagnosis journey
- 🔗 the same item's full entry in `plans/FEEDBACK.md` for the longer history

---

## 1. UniswapX has zero testnet deployments — every team building UniswapX-aware agents hits a day-one wall

**Friction observed**: We audited the four candidate testnets (Sepolia, Unichain Sepolia, Base Sepolia, Arbitrum Sepolia) for deployed UniswapX Reactor coverage at the start of Sprint 5.5. Result: **none of the canonical mainnet UniswapX Reactor addresses** have bytecode on **any** of the four testnets. Cross-checked V2 Dutch (`0x00000011f84b…289be`), Priority Reactor (`0x00000006021a…956e37`), V1 Exclusive Dutch (`0x6000da47…645C4`), DutchV3 (`0xB274d5F4…04a87c`) — every cross-chain probe returned `0x` (empty bytecode). v4 PoolManager + Permit2 ARE deployed on every chain; only UniswapX is absent.

This forced our entire end-to-end demo to pivot from testnet to mainnet fork — a strictly stronger demo path (real protocol, real contracts) but a painful day-one surprise for any hackathon team or new builder.

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

Full audit: [`plans/sprint-05.5-testnet-e2e/01-testnet-audit-progress.md`](./plans/sprint-05.5-testnet-e2e/01-testnet-audit-progress.md).

**Suggested change**: Deploy at least one Reactor variant (V2 Dutch is sufficient) on **Unichain Sepolia** as the canonical test environment. Pin the address in [the deployments page](https://docs.uniswap.org/contracts/uniswapx/v2/deployments) with explicit "testnet" call-out. Include a Sepolia-funded test wallet operator can request from a faucet.

Or, second-best: a one-pager titled "How to test UniswapX without testnet deployments" on docs.uniswap.org pointing at mainnet fork as the canonical path. We'd happily contribute the recipe.

**Criticality**: **HIGH** for any team building a UniswapX-aware agent on day 1 of a hackathon or onboarding. Cost: ~4 hours per team to hit the wall + pivot to mainnet fork.

**Cross-references**: 📂 [`plans/sprint-05.5-testnet-e2e/decisions.md`](./plans/sprint-05.5-testnet-e2e/decisions.md) — full per-chain audit | 🔗 plans/FEEDBACK.md F-57

---

## 2. UniswapX Trading API has no documented Intent JSON wire format — every consumer reverse-engineers it

**Friction observed**: To build a solver that subscribes to pending intents (the canonical permissionless-solver loop), the SDK needs a documented HTTP/WS feed of "open orders, signed but not yet filled." UniswapX has the relayer infrastructure (institutional fillers obviously consume it) but the **public Trading API does not document the Intent JSON wire format** — neither schema, nor endpoint URL, nor authentication model.

Without this, every solver builder reverse-engineers from the SDK source + open-source bots. This is the root cause that blocks our `tradingApiIntentSource` SDK adapter (item 3 below).

**Reproducer**:

```bash
# The official quote endpoint exists:
$ curl 'https://trade-api.gateway.uniswap.org/v1/quote?...'
{ "route": [...], "output": "...", "calldata": "..." }

# An "open intents" endpoint does not exist publicly, or is undocumented:
$ curl -i 'https://trade-api.gateway.uniswap.org/v1/intents?chainId=130&minSize=...'
HTTP/2 404
```

Search [`docs.uniswap.org`](https://docs.uniswap.org) for "Intent JSON" / "open orders feed" / "subscribeIntents" — minimal coverage.

**Suggested change**: Publish the Intent wire-format schema as part of the Trading API's OpenAPI spec. Even if the **production endpoint** isn't ready for general public use, document the schema so the open-source ecosystem can self-host indexers (Tycho-shape) that match the format. Specifically:

```yaml
# Trading API OpenAPI addition
/v1/intents/stream:
  get:
    summary: SSE stream of pending UniswapX intents
    parameters:
      - name: chainId
      - name: reactor
      - name: minSizeUsd
    responses:
      200:
        content: { text/event-stream: { ... Intent schema ... } }
```

The schema itself can be extracted from the existing UniswapX SDK; the documentation is the gap.

**Criticality**: **HIGH** — this is the single largest gap between "permissionless solver SDK works" and "permissionless solver actually permissionless." Every hackathon team builds around it.

**Cross-references**: 🔗 plans/FEEDBACK.md F-15 + F-64 (downstream consequence)

---

## 3. SDK can subscribe to *settled* intents but not *pending* ones — direct consequence of item #2

**Friction observed**: Our SDK's `subscribeIntents(filter, handler)` is the canonical hook a vertical solver uses. We ship a `chainFillIntentSource` (observational — tails the Reactor's `Fill` event after a fill has happened). What we **cannot ship**, gated on item #2 above, is a `tradingApiIntentSource` that emits intents **before** they're filled.

The SDK's own [`packages/sdk/src/intents/chainFillSource.ts` header comment](https://github.com/filler-sdk/filler-sdk/blob/main/packages/sdk/src/intents/chainFillSource.ts) is honest about this:

> **Not a filling source.** Fill events are emitted post-settle. Use `pollingIntentSource` (or a custom relayer-API source) to find fillable open orders.

But there is no built-in `pollingIntentSource` against UniswapX. Builders must hand-roll a Trading API client that doesn't exist as a documented HTTP surface.

**Reproducer**:

```ts
import { createFillerFromPrivateKey } from '@filler-sdk/sdk';

const filler = createFillerFromPrivateKey({...});

// Today's behavior — observational subscription:
filler.subscribeIntents(filter, async (intent) => {
  // intent has just been filled by SOMEONE — not us. Too late to fill.
  console.log('Intent settled:', intent.orderHash);
});
```

The "permissionless solver" loop requires the source to emit BEFORE settlement. With item #2 fixed, a `tradingApiIntentSource` is a 1-day spike to ship.

**Suggested change**:

1. Close item #2 (Intent wire format) — that's the prerequisite.
2. Once schema is published, we volunteer `@filler-sdk/sdk` will ship `createTradingApiIntentSource(opts)` as a tree-shakable sub-export.
3. As an interim, the Foundation could fund an open-source mirror indexer (a Tycho-grade open-source feed) that consumes the existing relayer state and re-broadcasts as a public WS/SSE.

**Criticality**: **HIGH** — this is what limits the SDK's "permissionless solver" claim. Today, we ship a vertical-solver SDK where the operator triggers their own intents (which is genuinely useful — see treasury-rebalance hero example). The autonomous-solver category needs item #2 closed.

**Cross-references**: 📂 [`packages/sdk/src/intents/chainFillSource.ts`](./packages/sdk/src/intents/chainFillSource.ts) | 🔗 plans/FEEDBACK.md F-64

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

**Reproducer**: see [`plans/sprint-05.5-testnet-e2e/04-intent-submission-cli-progress.md`](./plans/sprint-05.5-testnet-e2e/04-intent-submission-cli-progress.md) §3 for the full diagnosis path. One-liner:

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

**Cross-references**: 📝 [`plans/sprint-05.5-testnet-e2e/04-intent-submission-cli-progress.md`](./plans/sprint-05.5-testnet-e2e/04-intent-submission-cli-progress.md) §7 — full root-cause investigation | 🔗 plans/FEEDBACK.md F-61

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

**Criticality**: **HIGH** for hackathon teams + new builders choosing target chains. Cost: a day's worth of pivoting.

**Cross-references**: 📝 [`plans/sprint-05.5-testnet-e2e/06-e2e-validation-progress.md`](./plans/sprint-05.5-testnet-e2e/06-e2e-validation-progress.md) §3.1 | 🔗 plans/FEEDBACK.md F-65

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

**Cross-references**: 📂 [`packages/sdk/src/keeperhub/`](./packages/sdk/src/keeperhub) — our adapter for the KeeperHub track | 🔗 plans/FEEDBACK.md F-25

---

## 7. `Filler.sol`'s in-range JIT requires output-token inventory — hidden constraint, SDK doesn't pre-flight check it

**Friction observed**: This is OUR architectural finding, but the lesson is general: **the canonical JIT pattern (`add → swap → remove`) requires the Filler to hold inventory of the OUTPUT currency** when the LP position covers the current tick. A pure JIT solver with zero inventory cannot use this pattern; the LP `modifyLiquidity` `+L` call requires both currencies.

The treasury-rebalance vertical absorbs this naturally (DAOs hold inventory). For other verticals, it's a constraint that's not visible from the SDK's public `prepareFill → submitFill` surface.

We hit this with empty output-token balance: `Filler.execute` reverts at `_addJitLiquidity`'s `safeTransfer` — opaque to the operator. Pre-funding fixed it.

**Reproducer**:

```ts
// Filler at 0x... with allowedCurrencies={USDC, WETH} but balance(WETH) == 0
await filler.submitFill(intent, params);
// → reverts at _addJitLiquidity's safeTransfer with insufficient balance
```

**Suggested change** (we'd ship):

1. **`@filler-sdk/sdk`**: `prepareFill` checks `Filler.balanceOf(outputCurrency) >= estimatedJITDeposit` and returns `null` with `reason: "insufficient-output-inventory"` when not. Adds a one-line pre-flight assertion that catches the issue at intent-prep time rather than tx-broadcast time.
2. **`Filler.sol`**: emit a typed error `InsufficientInventory(Currency currency, uint256 needed, uint256 have)` instead of bubbling up the underlying `safeTransfer` revert.
3. **Docs**: an "Inventory requirements" section to the SDK's solver-author guide, making clear that in-range JIT requires output-token holdings + suggesting verticals (treasury, vault) that naturally have it.

We'd contribute the docs chapter back as `agent_inventory.md` for `uniswap-ai/uniswap-trading`.

**Criticality**: **MEDIUM** — affects production builds. Less critical for hackathon scope (treasury-rebalance vertical sidesteps it).

**Cross-references**: 📂 [`contracts/src/Filler.sol`](./contracts/src/Filler.sol) lines 265-277 (`_addJitLiquidity`) — the constraint's source | 📝 [`plans/sprint-05.5-testnet-e2e/06-e2e-validation-progress.md`](./plans/sprint-05.5-testnet-e2e/06-e2e-validation-progress.md) §3.3 | 🔗 plans/FEEDBACK.md F-66

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

**Cross-references**: 🔗 plans/FEEDBACK.md F-14

---

## 9. v4 `PoolManager.donate()` is `onlyByLocker` — solver-side EOA donation is impossible without contract extension

**Friction observed**: The LVR-aware vertical (one of our four canonical recipes) wants the solver to donate a fraction of the captured spread back to in-range LPs. The natural primitive is `PoolManager.donate(poolKey, amount0, amount1)` — but this is gated `onlyByLocker`. An EOA cannot call it directly; only the locked (unlock-callback) contract can.

This means LVR-aware solvers can't simply forward part of their balance to LPs after a fill. They need a contract-side extension that performs the donate inside the same unlock context as the swap.

We worked around it by extending `Filler.unlockCallback` to accept a `donate0`/`donate1` field in `FillParams` — but this is custom plumbing every LVR-aware solver re-rolls.

**Reproducer**:

```solidity
// EOA (or non-locker contract) attempts donate:
poolManager.donate(poolKey, amount0, amount1, "");
// → reverts: ManagerLocked (only-by-locker check fails)
```

**Suggested change**: Either:

1. Relax `donate()` access — allow any caller as long as they fund the donation amount (verify via balance delta, same pattern as `take`).
2. Or ship a canonical `DonationHelper` contract in `v4-periphery` that any solver / LP can call without rolling their own unlock-callback extension.

**Criticality**: **MEDIUM** — blocks one specific vertical (LVR-aware) cleanly. Workarounds exist but proliferate per-team.

**Cross-references**: 📂 [`apps/docs/pages/recipes/lvr-aware.mdx`](./apps/docs/pages/recipes/lvr-aware.mdx) — our recipe documents the `PoolManager.donate` integration point | 🔗 plans/FEEDBACK.md F-35

---

## 10. Treasury internalisation is undocumented as a UniswapX pattern — despite being the highest-leverage DAO use case

**Friction observed**: The most compelling vertical we found for UniswapX (and the basis for our [hero example](./examples/treasury-rebalance)) is **DAO treasury internalisation**: a DAO running its own solver to fill the DAO's own intents. For a $50M quarterly rebalance, the spread saved (10–30 bps internalised vs. paid to aggregators) is **$50K–$150K per cycle**. A treasury manager running this for a year captures ~$200K–$600K of formerly-leaked value.

We found zero documentation of this pattern in `docs.uniswap.org` or the Trading API guides. The technical primitives all exist (V2 Dutch Reactor, Permit2, the SDK), but the pattern is unsurfaced. Builders looking for "how does my DAO use UniswapX" find quote-and-fill examples, not internalisation patterns.

**Reproducer**: search [docs.uniswap.org](https://docs.uniswap.org) for "treasury internalisation" / "DAO solver" / "spread capture" / "filler your own intents." Minimal coverage. Search [uniswap-ai](https://github.com/Uniswap/uniswap-ai) — same.

**Suggested change**: Add a **DAO Treasury Recipe** chapter to `uniswap-ai/uniswap-trading` covering:
- The economic motivation (linkable cita: GnosisDAO leaked $700K to oracle-lag arbitrage in 2025; see Protos coverage)
- The strategy filter (`swapper == DAO_TREASURY`)
- Key/wallet separation requirements (Permit2 nonce isolation; cf. item below if relevant)
- Production checklist (audit, multisig, monitoring, inventory)

We'd contribute this chapter directly. Our hero example [`examples/treasury-rebalance`](./examples/treasury-rebalance) is the working reference implementation, MIT-licensed.

**Criticality**: **MEDIUM** — discovery gap. The technical infra works; the marketing/documentation gap means DAOs don't know they can do this until a hackathon team writes a recipe.

**Cross-references**: 📂 [`examples/treasury-rebalance/`](./examples/treasury-rebalance) — full hero example | 📝 [`plans/sprint-07-demo-submission/01-citas-publicas-research-progress.md`](./plans/sprint-07-demo-submission/01-citas-publicas-research-progress.md) — economic citations | 🔗 plans/FEEDBACK.md F-38

---

## What we'd contribute back to the ecosystem

If any of the above resonates, we're ready to ship:

1. **`@filler-sdk/jit-hints` indexer** — Ponder-based v4 hook indexer with JIT depth API. MIT-licensed, self-hostable. Could be vendored / forked into a Foundation-blessed reference indexer (Tycho-shape).
2. **`@filler-sdk/sdk` Trading API source** — once item #2 (Intent JSON schema) is closed, we'd ship `createTradingApiIntentSource(opts)` as a tree-shakable sub-export.
3. **`agent_security.md` chapter** for `uniswap-ai/uniswap-trading` — covering MEV protection patterns (item #6), private routing, slippage bounds, autonomous-operation recommendations.
4. **`agent_inventory.md` chapter** — covering the Filler-inventory constraint (item #7), with the four canonical verticals' inventory profiles.
5. **DAO Treasury recipe** (item #10) — full walk-through with our hero example as reference.
6. **Co-authoring** an "agent posture for UniswapX solvers" position paper alongside Foundation team or a partner DAO — this is the topology we live in for 6+ months and have honest opinions on.

---

## The other 56 items

Plans 02 through 07 of the development log accumulated **66 distinct frictions** in total — every one with reproducer + suggested change + criticality. Categories beyond the 10 above:

- TypeScript ecosystem gaps (Zod env-var quirks, viem typing escape hatches, Bun/ESM gotchas) — F-11 through F-32
- v4 hooks testing infrastructure (`@uniswap/v4-test-helpers` would save ~2 days per team) — F-19, F-20, F-48
- Foundry & Solidity workflow (immutable bytecode comparison, NatSpec generation, `forge inspect` quirks) — F-1 through F-5, F-58
- Indexer hosting economics (Ponder 2-process minimum on $5/mo tiers) — F-59, F-60
- Demo + dashboard infrastructure (SSE reconnect patterns, replay-mode determinism, mermaid SVG prerender) — F-44 through F-56
- Hackathon-craft observations on naming + memetic handles + slide deck color discipline — F-49, F-42, F-43, F-47

The full archive lives at [`plans/FEEDBACK.md`](./plans/FEEDBACK.md). Each item is dated against the sprint where we hit it; cumulative tracking matrix at the bottom.

---

## Methodology

We commit to honest, actionable feedback:

- **Specific** — names the exact endpoint, file, contract, or commit
- **Reproducible** — copy-paste reproducer included
- **Actionable** — proposed change is implementable, not aspirational
- **Honest** — no exaggeration; "HIGH" criticality reserved for blockers of categories
- **Constructive** — proposal-shaped, not complaint-shaped

Each item was added when we encountered it in real implementation, NOT speculatively. The plan structure in [`plans/`](./plans) maps each sprint's work to its specific feedback items. No item below was synthesized to hit a quota.

The 10 above were selected from 66 by a single criterion: **if any one were addressed, would the next builder's experience materially improve?**

We'd love to talk.

---

## Closing

Filler SDK was built during ETHGlobal OpenAgents (April–May 2026) for the Uniswap Foundation track ($5,000 prize pool). Project repo: [github.com/filler-sdk/filler-sdk](https://github.com/filler-sdk/filler-sdk). MIT-licensed, immutable contracts, multisig-owned, self-hostable.

We've enjoyed building on this stack. The 66 items above are the price of admission for hard problems with novel primitives — and we think the primitives are good. We hope the items help the next iteration.

— The Filler SDK team, ETHGlobal OpenAgents 2026
