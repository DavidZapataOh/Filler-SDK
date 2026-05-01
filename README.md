# Filler SDK

> *"Tres archivos y un bond."*

[![CI](https://github.com/filler-sdk/filler-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/filler-sdk/filler-sdk/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Contributor Covenant](https://img.shields.io/badge/Contributor%20Covenant-2.1-4baaaa.svg)](./CODE_OF_CONDUCT.md)

The SDK to deploy vertical UniswapX solvers in `npm install`.

> **Status**: in active development during ETHGlobal OpenAgents. Final docs site lands in Sprint 06.

## What is this?

Today, running a UniswapX solver takes ~4 weeks of infra before the first fill — indexer, inventory tracking, atomic JIT pattern, MEV protection. That barrier monopolizes the solver layer to ~10 institutional desks optimized for majors.

Filler SDK collapses that into `npm install`. We don't compete with Wintermute on majors — we enable the 50+ verticals where institutional solvers don't reach: hook-specific solvers, treasury internalization, LVR-aware strategies, atomic compound fills.

## Quickstart

```bash
npx create-filler my-solver
cd my-solver
bun install
bun start
```

> **Note**: `create-filler` ships in Sprint 04. Until then, see [Roadmap](#roadmap).

## Architecture

Three layers — all self-hosted, MIT-licensed, ecosystem-aligned with Foundry / Tycho / viem:

```
┌────────────────────────────────────────────────────────┐
│  Frontend (static, optional)                           │
│   • Demo dashboard with live SPREAD CAPTURED counter   │
│   • Vocs documentation site                            │
└────────────────────┬───────────────────────────────────┘
                     │ HTTP / SSE
┌────────────────────▼───────────────────────────────────┐
│  Off-chain services (self-hosted)                      │
│   • @filler-sdk/jit-hints — Ponder-based v4 indexer    │
│   • @filler-sdk/sdk — TypeScript solver SDK            │
│   • Reference solver bots (3 verticals)                │
└────────────────────┬───────────────────────────────────┘
                     │ RPC / WS
┌────────────────────▼───────────────────────────────────┐
│  On-chain                                              │
│   • Filler.sol  — IReactorCallback + IUnlockCallback   │
│   • FillerBond.sol — stake / slash / withdraw          │
│   • UniswapX Reactor + v4 PoolManager (Uniswap)        │
└────────────────────────────────────────────────────────┘
```

## Packages

| Package | What | Status |
|---|---|---|
| `@filler-sdk/sdk` | Main SDK for writing solvers | Sprint 03 |
| `@filler-sdk/jit-hints` | v4 indexer + JIT depth API | Sprint 02 |
| `create-filler` | Project scaffolding CLI | Sprint 04 |
| `Filler.sol` + `FillerBond.sol` | Smart contracts | Sprint 01 |

## Roadmap

This repo is being built across 8 sprints. Tracked progress:

| # | Sprint | Status |
|---|---|---|
| 00 | Foundation | ✅ Complete |
| 01 | Smart Contracts | ⏳ Pending |
| 02 | Indexer | ⏳ Pending |
| 03 | SDK | ⏳ Pending |
| 04 | CLI + References | ⏳ Pending |
| 05 | Dashboard | ⏳ Pending |
| 06 | Documentation | ⏳ Pending |
| 07 | Demo + Submission | ⏳ Pending |

## Contributing

We welcome contributions! Start with [`CONTRIBUTING.md`](./CONTRIBUTING.md).

By participating, you agree to abide by our [Code of Conduct](./CODE_OF_CONDUCT.md).

## Security

Vulnerability reports: see [`SECURITY.md`](./SECURITY.md). Email: **security@filler-sdk.xyz**.

Pre-mainnet, contracts will be:

- 90%+ Foundry test coverage (line + branch)
- Slither + Mythril clean (0 medium+)
- Echidna 1M+ runs property tests
- Halmos formal verification of critical invariants
- Multisig ownership from day 1
- Trail of Bits / Spearbit audit (Q3 2026 roadmap)
- Bug bounty on Immunefi (post-mainnet)

## License

[MIT](./LICENSE) © 2026 Filler SDK contributors

## Sponsors

Built during [ETHGlobal OpenAgents](https://ethglobal.com/events/openagents) — April–May 2026.

Thanks to:

- **[Uniswap Foundation](https://uniswapfoundation.org)** — for funding the v4 + UniswapX ecosystem this is built on
- **[KeeperHub](https://keeperhub.com)** — for execution reliability infrastructure
