<p align="center">
  <img src="img/filler.svg" alt="Filler SDK" width="20%" />
</p>

<h1 align="center">Filler SDK</h1>

<p align="center">
  <strong>Permissionless solver SDK for UniswapX</strong>
</p>

<p align="center">
  Three files and a bond.
</p>

<p align="center">
  <a href="#demo-video">Video</a> · <a href="#how-it-works">How It Works</a> · <a href="#track-integrations">Track Integrations</a> · <a href="#getting-started">Run Locally</a> · <a href="#smart-contracts">Contracts</a>
</p>

<p align="center">
  <a href="https://github.com/DavidZapataOh/filler-sdk/actions/workflows/ci.yml"><img src="https://github.com/DavidZapataOh/filler-sdk/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT" /></a>
  <a href="./contracts/foundry.toml"><img src="https://img.shields.io/badge/Solidity-0.8.30-363636.svg?logo=solidity" alt="Solidity 0.8.30" /></a>
  <a href="https://bun.sh"><img src="https://img.shields.io/badge/Bun-1.1.30%2B-fbf0df?logo=bun&logoColor=000" alt="Bun" /></a>
</p>

---

## The Problem

UniswapX moves billions in intent-based volume — yet running a solver takes **~4 weeks of infrastructure** before the first fill. That barrier monopolizes the solver layer for ~10 institutional desks (Wintermute, SCP, Propeller, Barter) optimized for majors.

Meanwhile, real treasuries leak real money to that gap. **GnosisDAO** had a **$175M treasury**. In 2025, public reporting documents **$700,000 lost to oracle-lag arbitrage** in a single pool, plus **$8M of concentrated liquidity that sat out of range earning nothing** ([Protos, Apr 2026](https://protos.com/defi-gets-leaner-gnosis-fires-treasury-manager-with-88-backing/)). Every DAO with a real treasury is paying this silent tax.

| Existing Solution | Open-source | First fill | UniswapX-native | Vertical-shaped | DAO-friendly |
|---|:---:|:---:|:---:|:---:|:---:|
| Institutional desks (Wintermute, SCP) | No | Days | Yes | No | No |
| CoW solver SDK | Yes | Weeks | No (CoW Protocol) | No | No |
| Forking the UniswapX reactor | Yes | Weeks | Yes | Manual | No |
| Hosted solver-as-a-service | No | Hours | Limited | No | Limited |
| **Filler SDK** | **Yes** | **`npm install`** | **Yes** | **Yes** | **Yes** |

Filler SDK doesn't compete with Wintermute on majors. It enables the **long tail of vertical solvers** — treasury internalization, hook-specific fillers, LVR-aware strategies, atomic compound fills — the segments institutional desks structurally don't reach.

---

## How It Works

A swapper (or DAO treasury) signs an intent off-chain. The intent lands at the canonical UniswapX V2 Reactor. Filler SDK wraps the reactor callback with an atomic JIT pattern on Uniswap v4 — adding liquidity in-band, executing the swap, and removing the position, all in a single transaction.

```
┌──────────────────────────────────────────────────────────────────────┐
│                          FILLER SDK                                  │
│                                                                      │
│  ┌───────────┐    ┌────────────────┐    ┌─────────────────────────┐  │
│  │  Swapper  │    │ UniswapX V2    │    │  Filler.sol  (yours)    │  │
│  │  / DAO    │    │ Dutch Reactor  │    │                         │  │
│  │           │───▶│ (real Uniswap) │───▶│ 1. reactorCallback      │  │
│  │ Sign      │    │                │    │ 2. PoolManager.unlock   │  │
│  │ intent    │    │ executeWith    │    │ 3. JIT add liquidity    │  │
│  │ (Permit2  │    │  Callback      │    │ 4. swap                 │  │
│  │ + cosig)  │    │                │    │ 5. JIT remove           │  │
│  └─────┬─────┘    └────────────────┘    │ 6. settle deltas        │  │
│        │                                 └────────────┬────────────┘  │
│        ▼                                              ▼               │
│   ┌─────────────────────────────────────────────────────────────┐    │
│   │           Uniswap v4 PoolManager (real Uniswap)             │    │
│   │           Atomic JIT add → swap → remove                    │    │
│   └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  On-chain output: Reactor emits Fill event • spread captured         │
│  by the Filler stays inside the wallet that submitted the intent     │
└──────────────────────────────────────────────────────────────────────┘
```

**What stays the same as today:** the Reactor, the Permit2 path, the v4 PoolManager — all real Uniswap contracts, no forks.

**What's new:** the four files you ship — `strategy.ts` (what to fill), `filler.ts` (how to run), `config.ts` (your environment), and the `FillerBond.sol` stake (skin in the game). Three files and a bond.

---

## Demo Video

> **[Watch the 3-minute demo →](#)** *(YouTube link — pending upload)*

The demo runs against an Ethereum mainnet fork, deploys `Filler.sol` + `FillerBond.sol` at deterministic addresses, signs a real UniswapX V2 Dutch order, and executes the fill on-chain — all in **25 seconds**. Real swap: 100 USDC → 0.043 WETH, JIT spread captured by the Filler.

Live demo (replay mode, deterministic): **[filler-sdk.vercel.app](https://filler-sdk.vercel.app/?replay=treasury)**

Live documentation: **[filler-sdk-docs.vercel.app](https://filler-sdk-docs.vercel.app/)**

---

## Track Integrations

Filler SDK ships **4 distinct surfaces** of value across two hackathon tracks:

### Uniswap Foundation — primary track ($5,000)

| # | Surface | What It Does | File |
|---|---------|-------------|------|
| 1 | **UniswapX V2 Reactor** | Implements `IReactorCallback`; calls `executeWithCallback` on the canonical mainnet Reactor `0x00000011f84b9aa48e5f8aa8b9897600006289be` | [`contracts/src/Filler.sol`](contracts/src/Filler.sol) |
| 2 | **Uniswap v4 PoolManager** | Atomic JIT pattern via `PoolManager.unlock` → in-band liquidity → swap → remove → settle deltas | [`contracts/src/Filler.sol#L206-L234`](contracts/src/Filler.sol) |
| 3 | **Permit2** | Off-chain signed intents; self-cosignature workaround for the V2 Dutch cosigner trap (filed in FEEDBACK.md) | [`packages/sdk/src/intents/`](packages/sdk/src/intents/) |
| 4 | **FEEDBACK.md** | 10 hand-curated, verified developer-friction items (the prize centerpiece) | [`FEEDBACK.md`](./FEEDBACK.md) |

### KeeperHub — secondary track ($5,000 = $4,500 Best Use + $500 Builder Feedback)

| # | Surface | What It Does | File |
|---|---------|-------------|------|
| 5 | **KeeperHub workflow API** | Type-safe TypeScript client for MEV-protected fill submission; Zod-validated wire format; cooperative `AbortSignal` cancellation | [`packages/sdk/src/keeperhub/client.ts`](packages/sdk/src/keeperhub/client.ts) |
| 6 | **KEEPERHUB_FEEDBACK.md** | 7 items covering OpenAPI spec gaps, outbound-webhook absence, x402 docs, MCP-vs-HTTP, rate-limit headers | [`KEEPERHUB_FEEDBACK.md`](./KEEPERHUB_FEEDBACK.md) |

---

## Architecture

```
                          ┌───────────────────────────────────┐
                          │   apps/dashboard  (React + Vite)  │
                          │   Live SPREAD CAPTURED counter    │
                          │   JIT depth chart · 4-file reveal │
                          └────────────────┬──────────────────┘
                                           │
                          ┌────────────────▼──────────────────┐
                          │    @filler-sdk/sdk  (TypeScript)  │
                          │    intent stream · prepare/submit │
                          │    bond client · KeeperHub adapter│
                          └────────┬───────────────┬──────────┘
                                   │               │
              ┌────────────────────▼──┐         ┌──▼─────────────────────────┐
              │ @filler-sdk/jit-hints │         │ Filler.sol (your contract) │
              │ Ponder v4 indexer     │         │                            │
              │ JIT depth API         │         │ 1. reactorCallback         │
              │ /jit-hints endpoint   │         │ 2. PoolManager.unlock      │
              └───────────────────────┘         │ 3. JIT add → swap → remove │
                                                │ 4. settle deltas           │
                                                └────────┬───────────────────┘
                                                         │
                                                ┌────────▼────────────────┐
                                                │  FillerBond.sol         │
                                                │  Stake / slash / unstake│
                                                │  Multisig-owned         │
                                                └─────────────────────────┘
```

---

## Smart Contracts

> **Honest framing**: the demo runs against an **anvil mainnet fork**. UniswapX has **zero testnet deployments** (verified across Sepolia / Unichain Sepolia / Base Sepolia / Arbitrum Sepolia — see FEEDBACK.md item #1). Mainnet deployment is on the post-audit roadmap (Q3 2026). The addresses below are deterministic from anvil's well-known account #0 — fork-mode reproducible across runs.

| Contract | Mode | Address | Source |
|----------|------|---------|--------|
| `Filler` | Fork-mode (deterministic) | `0xC489d11D03B2999A6ba568e02E0b95eFc58b6A34` | [`contracts/src/Filler.sol`](contracts/src/Filler.sol) |
| `FillerBond` | Fork-mode (deterministic) | `0x559Bb2F2beb43246bA63057F3750b742b92dBBf9` | [`contracts/src/FillerBond.sol`](contracts/src/FillerBond.sol) |
| **UniswapX V2 Reactor** (inherited) | Mainnet | [`0x00000011f84b9aa48e5f8aa8b9897600006289be`](https://etherscan.io/address/0x00000011f84b9aa48e5f8aa8b9897600006289be) | Canonical Uniswap |
| **v4 PoolManager** (inherited) | Mainnet | [`0x000000000004444c5dc75cb358380d2e3de08a90`](https://etherscan.io/address/0x000000000004444c5dc75cb358380d2e3de08a90) | Canonical Uniswap |
| **Permit2** (inherited) | Mainnet | [`0x000000000022D473030F116dDEE9F6B43aC78BA3`](https://etherscan.io/address/0x000000000022D473030F116dDEE9F6B43aC78BA3) | Canonical Uniswap |

### Contract Source Files

| File | Description |
|------|-------------|
| [`contracts/src/Filler.sol`](contracts/src/Filler.sol) | Reactor callback + atomic JIT pattern (`unlock` → add → swap → remove → settle) |
| [`contracts/src/FillerBond.sol`](contracts/src/FillerBond.sol) | Immutable, multisig-owned stake / slash / pending-withdrawal logic |
| [`contracts/src/libraries/FillParams.sol`](contracts/src/libraries/FillParams.sol) | `FillParams` struct + ABI-encoding helpers |
| [`contracts/src/libraries/DeltaSettler.sol`](contracts/src/libraries/DeltaSettler.sol) | v4 currency-delta settlement primitive |
| [`contracts/src/errors/`](contracts/src/errors/) | 16 typed error selectors with stable 4-byte signatures |

### Tests — 565+ passing across the workspace

| Test Suite | Tests | File |
|------------|:-----:|------|
| TypeScript SDK (vitest) | 421 | [`packages/sdk/test/`](packages/sdk/test/) |
| jit-hints indexer (vitest) | 60 | [`packages/jit-hints/test/`](packages/jit-hints/test/) |
| Dashboard (vitest + Testing Library) | 125 | [`apps/dashboard/test/`](apps/dashboard/test/) |
| Foundry (forge) | 90+ | [`contracts/test/`](contracts/test/) |
| E2E orchestrator (mainnet fork) | 1 (25s) | [`packages/sdk/scripts/e2e-fork.ts`](packages/sdk/scripts/e2e-fork.ts) |
| Echidna property tests | 1M+ runs | [`contracts/test/`](contracts/test/) |
| Halmos formal verification | Critical invariants | [`contracts/test/`](contracts/test/) |

---

## Indexer

Privacy-preserving JIT-depth API hosted on Ponder.sh. The novel piece is the `/jit-hints` endpoint — surfaces JIT-add candidate ranges by combining v4 pool state + recent swap velocity. The Uniswap Trading API doesn't expose this; every solver builds it from scratch (filed as feedback).

| File | Description |
|------|-------------|
| [`packages/jit-hints/ponder.config.ts`](packages/jit-hints/ponder.config.ts) | Multi-chain Ponder config (mainnet, Unichain) |
| [`packages/jit-hints/src/api/`](packages/jit-hints/src/api/) | Hono-based HTTP API (`/pools`, `/jit-hints`) |
| [`packages/jit-hints/src/handlers/`](packages/jit-hints/src/handlers/) | v4 PoolManager event handlers |

---

## Frontend (Dashboard)

Built with React 18, Vite 6, Tailwind CSS v4, lucide-react, and recharts. Replay-mode renders deterministic fixtures so judges see a working demo without operator-side infrastructure.

| Page | Route | Description |
|------|-------|-------------|
| Live demo | `/?replay=treasury` | DAO treasury rebalance — counter ticks, JIT depth animates, 4-file reveal |
| LVR scenario | `/?replay=lvr` | LVR-aware solver demo |
| Simple JIT | `/?replay=simple` | Baseline single-fill demo |

### Key Frontend Files

| File | Description |
|------|-------------|
| [`apps/dashboard/src/App.tsx`](apps/dashboard/src/App.tsx) | Root component — header, hero, live capture, JIT chart, ThreeFilesReveal, CTA, footer |
| [`apps/dashboard/src/components/SpreadCounter.tsx`](apps/dashboard/src/components/SpreadCounter.tsx) | Big Number + rolling buffer of last 10 fills (tx hash, block, timestamp, delta) |
| [`apps/dashboard/src/components/JITDepthChart.tsx`](apps/dashboard/src/components/JITDepthChart.tsx) | Recharts-based depth visualization with JIT-add range highlight |
| [`apps/dashboard/src/components/ThreeFilesReveal.tsx`](apps/dashboard/src/components/ThreeFilesReveal.tsx) | The "three files and a bond" memetic handle visualization |
| [`apps/dashboard/src/hooks/useReplayMode.ts`](apps/dashboard/src/hooks/useReplayMode.ts) | Deterministic fixture replay; reads `?replay=...` once at mount |
| [`apps/dashboard/src/hooks/useSSE.ts`](apps/dashboard/src/hooks/useSSE.ts) | SSE client with reconnect backoff (jittered + capped + attempt-counted) |

---

## Getting Started

### Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation) (forge, anvil, cast)
- [Bun](https://bun.sh/) 1.1.30+ (workspaces, runtime)
- An RPC URL with archive support (Alchemy free tier works; the script defaults to `ethereum.publicnode.com`)

### 1. Clone and install

```bash
git clone https://github.com/DavidZapataOh/filler-sdk.git
cd filler-sdk
bun install
```

### 2. Run the end-to-end demo (~25s)

```bash
bun run e2e:fork
```

Spawns an anvil mainnet fork → deploys `Filler.sol` + `FillerBond.sol` at deterministic addresses → initializes a v4 USDC/WETH 0.05% pool → seeds liquidity → funds wallets → stakes the bond → submits a UniswapX V2 Dutch order with self-cosignature → executes the fill on-chain.

Expected output (last 5 lines):

```
→ Submitting intent with REAL FillParams + capturing result
  ✓ tx mined SUCCESS: 0x... (block 25010080)
✓ E2E PASS in 25.5s. Filler.execute success: 0x...
```

### 3. Run the dashboard (live counter)

```bash
bun --filter '@filler-sdk/dashboard' dev
# → http://localhost:5173/?replay=treasury
```

### 4. Run the docs site

```bash
bun --filter '@filler-sdk/docs' dev
# → http://localhost:5173 (Vocs default)
```

### 5. Run all tests

```bash
bun test                       # 421 + 60 + 125 = 606 tests across the TS workspace
bun run test:contracts         # Foundry forge — contracts test suite
```

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Smart Contracts | Solidity 0.8.30 (EVM Prague), Foundry, Solady, OpenZeppelin |
| TypeScript SDK | viem 2.x, Zod, Pino, Bun + workspaces, Biome |
| Indexer | Ponder.sh, Hono, SQLite (dev) / Postgres (prod) |
| Frontend | React 18, Vite 6, Tailwind CSS v4, recharts, lucide-react |
| Documentation | Vocs (same stack as viem / wagmi), TypeDoc, forge doc |
| Static + dynamic + formal verification | Slither, Mythril, Echidna (1M+ runs), Halmos |
| Demo infrastructure | Anvil mainnet fork (no testnet — UniswapX is mainnet-only) |
| Chains | Ethereum mainnet (primary), Unichain (highest v4 liquidity) |

---

## Project Structure

```
filler-sdk/
├── contracts/                 Foundry project (Solidity 0.8.30)
│   ├── src/                   Filler.sol, FillerBond.sol, libraries, errors
│   ├── test/                  Foundry tests (unit, fuzz, invariants)
│   └── script/                Deploy scripts
├── packages/
│   ├── sdk/                   @filler-sdk/sdk — TypeScript SDK
│   ├── jit-hints/             @filler-sdk/jit-hints — Ponder v4 indexer
│   └── cli/                   create-filler — project scaffolder
├── apps/
│   ├── dashboard/             React + Vite live-counter dashboard
│   └── docs/                  Vocs documentation site (145 prerendered pages)
├── examples/
│   └── treasury-rebalance/    Hero example — DAO solver, workspace-linked
├── FEEDBACK.md                10 verified items for Uniswap Foundation track
├── KEEPERHUB_FEEDBACK.md      7 items for KeeperHub track
└── README.md                  this file
```

---

## Engineering Posture

- **Solidity 0.8.30** with `evm_version = "prague"`, `optimizer_runs = 1_000_000`, `via_ir = true`, `bytecode_hash = "none"` (reproducible builds)
- **Solady** for gas-critical primitives (Owned, SafeTransferLib) — ecosystem alignment with UF-funded Tycho
- **Permit2** for off-chain-signed approvals
- **viem 2.x** + **Bun + workspaces** + **Biome** + **Zod** + **Pino** for the TypeScript stack
- **Ponder.sh** for indexer (Tycho-shape; UF-funded patterns)
- **Vocs** for docs (same stack as viem / wagmi / Frame teams)
- **Vitest** + **Foundry forge** for tests (90%+ coverage on contracts; CI invariants 1K runs / deep 5K runs)
- **Slither + Echidna + Halmos** for static analysis + property fuzzing + formal verification

---

## Why This Matters

- **~10 institutional desks** monopolize the UniswapX solver layer — every new vertical (treasury internalization, hook-specific, LVR-aware, atomic compound fills) is structurally underserved
- **$700K + $8M leaked from a single $175M treasury in 2025** ([Protos](https://protos.com/defi-gets-leaner-gnosis-fires-treasury-manager-with-88-backing/)) — multiply across the 50+ DAOs with $10M+ treasuries
- **`npm install` to first verified on-chain fill in 25 seconds** — the barrier of entry drops to where the next layer of execution-agentic gets built
- **6 concrete contributions back to the Uniswap ecosystem** documented in FEEDBACK.md — Filler SDK is in the same shape Foundation has historically funded (Tycho $500K, OpenZeppelin Hooks Library $850K)
- **Zero existing projects** in the permissionless-solver-SDK category — Filler SDK is to UniswapX what Tycho is to v4 indexing

---

## Security

Vulnerability reports: [SECURITY.md](./SECURITY.md). 

Pre-mainnet posture:

- ✅ 90%+ Foundry coverage (line + branch)
- ✅ Slither + Mythril clean (no medium+ findings)
- ✅ Echidna 1M+ runs property tests
- ✅ Halmos formal verification of critical invariants
- ✅ Multisig ownership from day 1 (no EOA owner)
- ⏳ Professional audit (Trail of Bits / Spearbit) — Q3 2026 roadmap
- ⏳ Bug bounty on Immunefi — post-mainnet

---

## Contributing

Start with [CONTRIBUTING.md](./CONTRIBUTING.md). Conventional commits enforced; CI runs Biome + tsc strict + Foundry tests on every PR.

By participating, you agree to abide by our [Code of Conduct](./CODE_OF_CONDUCT.md).

---

## License

[MIT](./LICENSE) © 2026 Filler SDK contributors.

---

<p align="center">
  <em>Three files and a bond.</em>
</p>

<p align="center">
  Built for <a href="https://ethglobal.com/events/openagents">ETHGlobal OpenAgents 2026</a>
</p>
