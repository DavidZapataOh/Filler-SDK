# `@filler-sdk/docs`

Filler SDK public documentation site, powered by [Vocs](https://vocs.dev) (the same docs framework viem / wagmi / Frame use).

## Quick commands

| Command | What |
|---|---|
| `bun run dev` | Local dev server at `http://localhost:5173` (~1.5s startup) |
| `bun run build` | Production build → `dist/` |
| `bun run preview` | Preview the production build at `http://localhost:4173` |
| `bun run test` | Run quickstart-claims drift detector (locks docs to repo state) |
| `bun run typecheck` | tsc --noEmit |
| `bun run clean` | Remove `dist/` + `.vocs/` |

## One-time setup

Vocs prerenders Mermaid diagrams as SVG via headless Chromium. Install once:

```bash
bunx playwright install chromium
```

Without this, `bun run build` fails with a Playwright error at the prerender step.

## Regenerating auto-generated API references

Two slices of the docs are auto-generated and committed to git:

- `pages/api/contracts/` — from `forge doc` parsing NatSpec in `contracts/src/`
- `pages/api/sdk/` — from TypeDoc parsing TSDoc in `packages/sdk/src/`

After changing `Filler.sol` / `FillerBond.sol` / SDK exports, regenerate:

```bash
./scripts/generate-api-docs.sh
```

The script:
1. Runs `forge doc` against the contracts (with the `[doc]` section pinned in `foundry.toml`)
2. Flattens the `src/src/` nesting forge produces and writes to `pages/api/contracts/`
3. Runs `bunx typedoc` for the SDK (with `--useCodeBlocks --useHTMLEncodedBrackets` for MDX-safety)
4. Post-processes the TypeDoc output to escape stray `{` / `}` and `<digit` patterns that MDX 3 would otherwise reject

Then `bun run build` to render. The CI workflow [`docs.yml`](../../.github/workflows/docs.yml) automates this on PR.

## MDX gotchas (from Sprint 06 lessons)

| Pattern | Why it breaks | Fix |
|---|---|---|
| `<100ms` in prose | MDX 3 parses `<100ms` as a JSX tag | Wrap in backticks: `` `<100ms` `` |
| `(...)` inside `[(...)]` mermaid cylindrical node | Mermaid parser rejects nested parens | Replace with `or` or alternative phrasing |
| Bare `{` `}` in TSDoc rendered to MD | MDX treats `{ ... }` as JSX expression | Auto-escaped by `generate-api-docs.sh` post-processor |
| `useLayoutEffect` SSR warnings | Vocs internal — not our code | Cosmetic, ignore |

Run `bun run build` locally before any PR touching docs — catches these at write-time, not review-time.

## Page layout — what's where

```
apps/docs/
├── pages/
│   ├── index.mdx                       Landing (HomePage components)
│   ├── docs/
│   │   ├── intro.mdx                  /docs/intro — what is this
│   │   ├── quickstart.mdx             /docs/quickstart — `bun run e2e:fork`
│   │   ├── first-fill.mdx             /docs/first-fill — narrated 9-step walkthrough
│   │   ├── concepts/
│   │   │   ├── atomic-jit.mdx         on-chain primitive (sequenceDiagram)
│   │   │   ├── jit-hints.mdx          indexer + algorithm (flowchart)
│   │   │   ├── bond.mdx               accountability primitive (stateDiagram)
│   │   │   ├── topology.mdx           self-hosted layers (flowchart with subgraphs)
│   │   │   └── verticals.mdx          category thesis (decision tree)
│   │   └── guides/
│   │       ├── deploy.mdx             create-filler walkthrough
│   │       ├── bond.mdx               bond lifecycle
│   │       ├── keeperhub.mdx          MEV-protected broadcasting
│   │       └── production.mdx         pre-launch checklist
│   ├── recipes/
│   │   ├── index.mdx                  catalog + decision tree
│   │   ├── treasury-rebalance.mdx     HERO recipe
│   │   ├── simple-jit.mdx             baseline
│   │   ├── lvr-aware.mdx              LP-protective
│   │   └── hooks.mdx                  v4 hook authors
│   ├── api/
│   │   ├── sdk.mdx                    curated SDK landing (links to TypeDoc)
│   │   ├── sdk/                       AUTO-GENERATED (98 TypeDoc pages)
│   │   ├── contracts.mdx              curated contracts landing (error selector table)
│   │   ├── contracts/                 AUTO-GENERATED (21 forge-doc pages)
│   │   ├── jit-hints.mdx              indexer API
│   │   └── cli.mdx                    create-filler CLI
│   └── resources/
│       ├── feedback.mdx               summary of plans/FEEDBACK.md (66 items)
│       ├── adrs.mdx                   ADRs index
│       ├── changelog.mdx              release engineering pointer
│       └── roadmap.mdx                Q3 2026 → Q1 2027
├── public/
├── test/
│   └── quickstart-claims.test.ts      drift detector (Plan 02)
├── vocs.config.ts                     theme + sidebar + topNav
└── package.json
```

## Editing a page — the workflow

1. Edit the `.mdx` file in `pages/`
2. `bun run dev` (already running — Vocs auto-reloads)
3. Verify in browser
4. `bun run build` to confirm no MDX errors / deadlinks
5. `bun run test` to confirm Plan 02 drift detector still green
6. Commit

For new pages: also add the route to the sidebar in [`vocs.config.ts`](./vocs.config.ts).

## Style guide

- **Each page ≤ 800 words** (reading time ≤ 4 min at 200 wpm)
- **One mermaid diagram max** per concept page (more diagrams = slower prerender; build cost compounds)
- **Code blocks ground in real source** — every snippet should be either copied from real repo files or have a GitHub link to the source
- **Cross-links use absolute paths** (`/docs/quickstart`, not `./quickstart`) — same convention as Vocs sidebar
- **F-N references must exist** — Plan 02's drift detector enforces this; broken `F-N` links fail CI

## Architecture references

- **Vocs config**: [`vocs.config.ts`](./vocs.config.ts) — theme, sidebar, topNav, font
- **Build pipeline**: Vocs uses Vite under the hood; our build is `vite build` with Vocs MDX plugins + Playwright Mermaid prerender
- **Auto-gen pipeline**: `scripts/generate-api-docs.sh` orchestrates `forge doc` + TypeDoc; CI runs this in `.github/workflows/docs.yml`
- **Drift detector**: [`test/quickstart-claims.test.ts`](./test/quickstart-claims.test.ts) — locks 11 concrete claims (addresses, env vars, F-N links, CLI flags) against repo state

## Deploy

- **Production**: Vercel project (`docs.filler-sdk.xyz`) — deploy is `bunx vercel --prod` or auto-deploy via the GitHub integration. CI workflow has the `deploy` job gated behind a `VERCEL_TOKEN` secret.
- **Preview**: each PR's `docs.yml` workflow uploads the build as an artifact (14-day retention).

## License

MIT — same as the rest of the repo.
