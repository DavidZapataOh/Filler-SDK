# {{projectName}} — Treasury Rebalance Filler

> *Tu treasury era un cost center pagando spread a agregadores externos. Ahora es un profit center capturando ese mismo spread.*

The **hero example** for DAOs with $10M+ treasuries that want to **internalise** the spread they currently pay to external aggregators (1inch, CoW Swap, Bebop) on every rebalance.

## The pitch (90 seconds)

A DAO's treasury rebalances quarterly. Each rebalance moves $50M–$500M through aggregators. Aggregator markup is 10–30 bps — **that's $50K–$1.5M/quarter** evaporating to entities the DAO doesn't even directly negotiate with.

This vertical's solver IS the DAO's wallet. The DAO submits a UniswapX intent from its treasury Safe; this solver fills it; the captured spread stays in the same wallet. The solver and the swapper are the same entity — **internalisation**.

| | External aggregator | This solver |
|---|---|---|
| DAO submits intent | ✓ | ✓ |
| Aggregator wins fill | ✓ | ✗ |
| Spread leaves DAO | ✓ ($50K-$1.5M/quarter typical) | ✗ |
| Spread stays in DAO | ✗ | ✓ |
| Solver = DAO wallet | ✗ | ✓ |

## Reference DAOs

- **Aave** — Karpatkey-managed treasury rebalances quarterly. Public reports show ~$X/quarter in execution costs.
- **Compound** — Similar quarterly cadence, treasury operator submits via multisig.
- **ENS DAO** — Quarterly budget rebalances + airdrop unlock liquidity.
- **Optimism Collective** — RPGF disbursements + reserve management.
- **Frax** — Peg stability operations on FRAX/USDC.

Any DAO that rebalances treasury periodically loses spread. With this filler, it stays in the treasury.

## Quickstart — DEMO MODE (~30 seconds)

The fastest path to a live money counter. No chain, no bond, no private key.

```bash
cp .env.example .env       # DEMO_MODE=true is the default
bun install
bun start                  # solver online + dashboard SSE on :8080
```

Open `http://localhost:8080/events` to see synthetic `spread-captured` events stream live. Sprint 05's dashboard subscribes to this for the money counter.

## Quickstart — PRODUCTION MODE

```bash
# 1. Configure
cp .env.example .env
# Edit .env:
#   - DEMO_MODE=false
#   - SOLVER_PRIVATE_KEY (the DAO Safe's signer or a delegated operator)
#   - CHAIN_ID + RPC_URL + 4 contract addresses
#   - TREASURY_ADDRESS = the DAO Safe address
#   - TARGET_ALLOCATIONS / TOKEN_ADDRESSES per the DAO's policy

# 2. Install
bun install

# 3. Stake bond (one-time)
bun stake                  # 0.1 ETH default

# 4. Run
bun start                  # subscribes to Reactor; fills DAO intents
```

## How DEMO_MODE works

`DEMO_MODE=true` swaps `createFillerFromPrivateKey` for `createMockFiller` from `@filler-sdk/sdk/testing` (Sprint 03 Plan 09 testing utilities). The synthetic intent generator emits structurally-valid `Intent` objects from `TREASURY_ADDRESS`; the mock filler accepts them and returns realistic `FillResult`s with a 5–30 bps spread per fill. The dashboard's `spread-captured` event broadcasts to any connected client.

This is the **honest demo path**: synthetic intents are *acknowledged* synthetic (the spread numbers are simulated, not real on-chain swaps), but every type, shape, and event flow is real SDK code. The same `handleFill` runs in both modes — only the input source + the filler instance differ.

## Architecture

```
src/
├── treasury.ts            # Zod-validated DAO config (TREASURY_ADDRESS, allocations)
├── config.ts              # Zod-validated filler/network config
├── strategy.ts            # filter() = treasury-only; decide() = always-fill
├── syntheticIntents.ts    # Demo: emits realistic Aave-sized intents
├── dashboardEmitter.ts    # SSE server on /events for money counter
├── filler.ts              # Branches on DEMO_MODE; wires the loop
└── stake.ts               # One-time bond setup (production only)
```

## Dashboard integration

The solver exposes two HTTP endpoints on `DASHBOARD_PORT` (default 8080):

| Endpoint   | Description                                                   |
| ---------- | ------------------------------------------------------------- |
| `/events`  | SSE stream. Emits `spread-captured` per fill.                 |
| `/health`  | JSON `{status, clients, totalUSD}` for monitoring.            |

Each `spread-captured` event payload:

```json
{
  "txHash": "0x…",
  "orderHash": "0x…",
  "amountUSD": 12345.67,
  "totalUSD": 87654.32,
  "blockNumber": "21000123",
  "timestamp": 1746115200000
}
```

Sprint 05's dashboard renders `totalUSD` as a live counter + a feed of recent `amountUSD` events.

## Adapting for production

1. **Set `DEMO_MODE=false`**.
2. **`TREASURY_ADDRESS`** = the DAO Safe (or delegated operator) wallet.
3. **`SOLVER_PRIVATE_KEY`** = the same wallet (or a delegate the Safe authorises).
4. **Treasury operator submits intents** via the DAO Safe to the configured `REACTOR_ADDRESS`.
5. **This solver fills them** — captured spread is paid to `SOLVER_PRIVATE_KEY` wallet (typically the same Safe).

**Honest caveat on the front-run risk**: in the public relayer mempool, an external solver sees the DAO's intent and can race this self-filler. If the external solver wins, the DAO pays spread to a third party — exactly what we're trying to avoid. The pattern needs one of:

- **Private orderflow** — submit the intent to a permissioned relayer (KeeperHub or similar) where only the DAO's solver subscribes. This is the production wiring; toggle `useKeeperHub` at scaffold time.
- **Reliable gas race** — practical only when the DAO's self-filler runs on the same chain block builders prefer (Unichain, MEV-Boost relays with whitelisted searchers).
- **Worst-case-unchanged acceptance** — if an external solver wins, the DAO pays the *same* spread it would have paid 1inch / CoW. Best-case captures it; worst-case status-quo.

Pick one explicitly. Don't ship "internalisation" without picking, because the default — public mempool, no race advantage — gives the DAO no economic upside on the contested fills.

## Customising

Edit `src/strategy.ts` to allow multiple authorised swappers:

```ts
const AUTHORISED = new Set([
  treasuryAddress.toLowerCase(),
  '0x...delegate-operator-1',
  '0x...delegate-operator-2',
]);

filter(intent: Intent): boolean {
  return AUTHORISED.has(intent.swapper.toLowerCase());
}
```

Or enforce a minimum rebalance threshold:

```ts
decide(intent: Intent, params: FillParams): boolean {
  return intent.input.amount >= MIN_REBALANCE_USD * 1_000_000n;
}
```

## Documentation

- [Filler SDK reference](https://docs.filler-sdk.xyz)
- [Plan 05 progress doc](https://github.com/filler-sdk/filler-sdk/blob/main/plans/sprint-04-cli-references/05-treasury-rebalance-progress.md)
- [Sprint 05 dashboard](https://github.com/filler-sdk/filler-sdk/tree/main/plans/sprint-05-dashboard) — what consumes the SSE stream

## License

MIT
