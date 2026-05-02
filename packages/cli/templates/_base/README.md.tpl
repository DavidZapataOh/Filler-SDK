# {{projectName}}

Filler SDK solver — `{{vertical}}` vertical on `{{chain}}`.

> Scaffolded by `create-filler` ({{currentYear}}).

## Quickstart

```bash
cp .env.example .env
# Set SOLVER_PRIVATE_KEY and RPC_URL in .env
bun install
bun start
```

## Configuration

| Variable                | Description                                              |
| ----------------------- | -------------------------------------------------------- |
| `SOLVER_PRIVATE_KEY`    | 0x-prefixed 32-byte hex private key (required)           |
| `RPC_URL`               | RPC endpoint for `{{chain}}` (required)                  |
| `INDEXER_URL`           | JIT-hints indexer base URL (default: `{{indexerUrl}}`)   |{{#if useKeeperHub}}
| `KEEPERHUB_API_KEY`     | KeeperHub bearer token for MEV-protected routing         |
| `KEEPERHUB_BASE_URL`    | KeeperHub HTTP API base URL                              |{{/if}}
| `LOG_LEVEL`             | `trace` / `debug` / `info` / `warn` / `error` (default `info`) |
| `MIN_PROFIT_USD`        | Minimum profit per fill in USD (default `1`)             |

## Architecture

This solver wraps `@filler-sdk/sdk` for:

1. **Intent stream** — subscribe to UniswapX intents matching your filter.
2. **Pool discovery + depth hints** — query the indexer for the best v4 pool + JIT depth.
3. **Fill engine** — `prepare → simulate → execute` (with retry + slippage protection).{{#if useKeeperHub}}
4. **MEV-protected routing** — `submitFill({ useKeeperHub: true })` routes through KeeperHub's private mempool.{{/if}}

See `src/index.ts` for the full solver loop.

## Documentation

- [Filler SDK reference](https://docs.filler-sdk.xyz) — types, errors, surfaces.
- [JIT-hints indexer](https://github.com/filler-sdk/filler-sdk/tree/main/packages/jit-hints) — self-host for private depth queries.
- [Sprint 04 plans](https://github.com/filler-sdk/filler-sdk/tree/main/plans/sprint-04-cli-references) — what `create-filler` ships per vertical.

## License

MIT
