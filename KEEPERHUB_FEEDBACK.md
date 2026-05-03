# KEEPERHUB_FEEDBACK.md — Integration Feedback

> Developer feedback report from integrating **Filler SDK** with KeeperHub during ETHGlobal OpenAgents 2026.

This document targets the **Best Use of KeeperHub** track + **Builder Feedback** track. Each item is structured as actionable input to the KeeperHub HTTP API + SDK roadmap:

1. **Friction observed** — what was hard
2. **Reproducer** — how to verify (or how we tested in isolation)
3. **Suggested change** — diff or new endpoint spec
4. **Criticality** — High / Medium / Low for SDK builders integrating

---

## What we built

`KeeperHubClient` — a typed TypeScript client that wraps the KeeperHub workflow API for solver-side fill submission with private-mempool routing (MEV protection).

End-to-end integration:

1. `Filler.subscribeIntents` receives a UniswapX intent.
2. `Filler.prepareFill` queries the JIT-hints indexer + calibrates ticks → `FillParams`.
3. `Filler.submitFill(intent, params, { useKeeperHub: true })` routes through `KeeperHubClient.submitFill`:
   - `POST /api/workflows/submit` with the order + ABI-encoded callback.
   - Receive `{workflowId, status}`.
   - Poll `GET /api/workflows/executions/:executionId/status` until terminal status (`success` / `error` / `cancelled`) or timeout.
   - Return canonical `FillResult` so the caller can't tell direct vs. KH paths apart.

The `KeeperHubClient` is **fully typed** (Zod-validated wire format), has **cooperative cancellation** (`AbortSignal`), and **retries on transient poll failures** automatically.

**Integration file**: [`packages/sdk/src/keeperhub/client.ts`](./packages/sdk/src/keeperhub/client.ts)
**Test coverage**: 19 tests in [`packages/sdk/test/keeperhub/client.test.ts`](./packages/sdk/test/keeperhub/client.test.ts)

---

## Items

### KH-1: No public OpenAPI / JSON Schema spec for the workflow API

**Friction observed**: We couldn't find a published OpenAPI spec, JSON Schema, or machine-readable "wire format" artifact for KeeperHub's HTTP API. The `/api` section of the docs describes endpoints + response shapes in **prose only** — no Swagger UI, no `openapi.json`, no JSON Schema files linked anywhere.

For SDK builders this means:
- Every TypeScript / Python / Rust / Go SDK has to read prose and hand-translate field types into typed clients.
- Versioning is implicit — there's no way to detect a breaking schema change short of "your client started failing in production."
- Validation libraries (Zod, Pydantic, etc.) can't auto-generate schemas — they must be hand-written and kept in sync manually.
- IDE tooling (autocomplete, type checking) gets nothing from the docs site.

We hand-wrote Zod schemas for the workflow-submit + execution-status endpoints by reading the prose docs. The fields we ended up encoding (after cross-checking the docs):
- Workflow submit returns `{workflowId, status}` where `status` is the execution enum (`pending | running | success | error | cancelled`, per `/api/executions`).
- Execution status (`GET /api/workflows/executions/:executionId/status`) carries the same enum + optional `result` + optional `error`.
- bigints conventionally encoded as decimal strings on the wire (we assumed; not formally specced).

**If the formal spec disagrees with our hand-translation**, the impact lands in our SDK as a single file's worth of schema/path edits. We'd rather discover the divergence at integration time than in production.

**Reproducer**: try to find an OpenAPI spec at `https://docs.keeperhub.com/openapi.json` or any machine-readable schema linked from the docs index. As of May 2026, neither exists.

**Suggested change**:

1. Publish an OpenAPI 3.1 spec at `https://docs.keeperhub.com/openapi.json`.
2. Include explicit bigint-encoding rules (decimal-string vs. hex) in the spec.
3. Document the workflow status state machine + which transitions are terminal.
4. Add a "Solver SDK quickstart" page with a TypeScript snippet — would have unblocked us in 30 minutes instead of 3 hours.

**Criticality**: **HIGH** — every solver SDK integrator hits this. Each rediscovers the wire format independently. We accidentally became one of the documenters.

---

### KH-2: No OUTBOUND completion webhook for execution status

**Friction observed**: KeeperHub documents `POST /api/workflows/{workflowId}/webhook` for **inbound** triggers (webhook → start workflow), but no documented **outbound** completion webhook (KeeperHub → your URL when an execution reaches a terminal state). For SDK consumers this means:

- The only way to learn an execution finished is to poll `GET /api/workflows/executions/:executionId/status` — burning request budget.
- For solvers running on serverless platforms (Cloudflare Workers, Vercel Functions) with sub-1s CPU budgets, the polling loop blocks the worker from completing.
- For long-running executions (> 10s), the solver process either holds the connection open or runs a separate watcher — neither matches the trigger-based architecture KeeperHub itself favors elsewhere.

**Reproducer**: build a solver that runs on Cloudflare Workers (sub-1s execution budget). Try to use `KeeperHubClient.submitFill` with a 4s mean polling cadence — the worker times out before the workflow completes.

**Suggested change**:

1. Add an outbound completion webhook: `POST /api/workflows/submit { ..., completionWebhook: { url, signatureKey } }`.
2. Document HMAC signing (HMAC-SHA256 of the body, signature in `X-KeeperHub-Signature`) so consumers can verify the callback origin.
3. Add an `idempotencyKey` field (or auto-derive from `(executionId, status)`) so consumers can de-dup at-least-once delivery.
4. Update the SDK examples to show polling AND outbound-webhook patterns side by side.

**Criticality**: **MEDIUM** — polling works for long-running solvers; outbound completion webhooks would unlock serverless deployment. The inbound webhook pattern KH already supports validates the architecture is reachable.

---

### KH-3: x402 payment integration is mentioned in track materials but not specced

**Friction observed**: ETHGlobal OpenAgents materials reference x402 for gas payment. We didn't ship x402 because:

- No documented integration path between KeeperHub workflow API and x402.
- We assume the flow is: solver gets an x402 402 challenge from KH → solver pays → retries with the receipt header. But we couldn't verify.
- x402 in TypeScript libraries is also nascent — our retry logic doesn't have an x402 hook yet.

**Reproducer**: try to find documentation linking KeeperHub workflow API to x402. We didn't.

**Suggested change**:

1. Document the x402 integration path: which endpoints challenge, what the receipt header looks like, sample HTTP exchange.
2. Provide a TypeScript reference impl (or point at viem's HTTP transport extension) that auto-handles 402 retries.
3. Document fee schedule: how much x402 vs. retained ETH does KH charge per workflow? Solvers need this for net-profit math.

**Criticality**: **MEDIUM** — the track explicitly rewards x402-using integrations, but the docs don't cover it.

---

### KH-4: MCP server vs. HTTP — which is the canonical solver integration?

**Friction observed**: The track materials mention both an MCP (Model Context Protocol) server AND an HTTP API for KeeperHub. For an SDK consumer:

- **HTTP** is the obvious choice — works in any language, every runtime.
- **MCP** is for AI agents that want tool-use access to KH operations.

But the boundary isn't documented:
- Does the MCP server expose the same workflow primitives as HTTP?
- Can a solver use MCP tools server-side (via `mcp.connect`) instead of HTTP?
- What's the auth story for MCP — same Bearer tokens, or MCP-specific?

We chose HTTP. If MCP would have been better for some reason, we missed it.

**Reproducer**: read the track description; try to decide between HTTP + MCP without a comparison guide.

**Suggested change**:

1. A "Choosing your integration: HTTP vs. MCP" doc page comparing:
   - Latency per call (HTTP round-trip vs. MCP overhead).
   - Available tools / endpoints — is it 1:1 or does each have unique ones?
   - Auth (Bearer vs. MCP-specific).
   - Rate limits.
2. If MCP is the preferred path for AI-driven solvers, say so clearly + provide a TypeScript MCP-client example.

**Criticality**: **MEDIUM** — affects every solver author who has to choose.

---

### KH-5: Execution status enum — semantics documented one-liner-deep, no formal state diagram

**Friction observed**: The execution status enum (`pending`, `running`, `success`, `error`, `cancelled`) appears in `/api/executions` with one-line descriptions per value, but no formal state machine or transition diagram is published. For SDK consumers this leaves several questions unanswered:

- Allowed transitions: can `pending` → `cancelled` directly without ever entering `running`? Can `running` → `pending` (e.g., on internal retry)?
- Is `running` a single state, or does it cover both "submitted to mempool, waiting for inclusion" and "mined, waiting for N confirmations"? If a `txHash` is available mid-`running`, where does it surface?
- What's the timeout semantics — does KeeperHub itself time out a `pending`/`running` execution, or does the SDK consumer decide? If KH times out, which terminal state is set (`error`? `cancelled`?)?

For a solver that wants early observability ("we have a tx hash, show it in the dashboard before final receipt"), the current enum forces a binary "running OR done" model.

**Reproducer**: read the `/api/executions` status enum docs; try to draw the state machine. The transitions aren't enumerated.

**Suggested change**:

1. Publish a state-machine diagram + table of allowed transitions.
2. Document where `txHash` first becomes observable in the lifecycle. If it's available during `running`, surface it in the status response.
3. Document timeout behavior: who can time out, what terminal state is reached, whether the consumer can configure the timeout.
4. If a "confirming" sub-state inside `running` is meaningful, expose it as a separate field (e.g., `runningPhase: 'submitted' | 'mined-pending-confirmations' | 'finalizing'`).

**Criticality**: **LOW–MEDIUM** — the polling loop works as-is; richer state semantics would unlock better solver-side observability + faster operator dashboards.

---

### KH-6: Rate-limit response headers (`X-RateLimit-Remaining`, `Retry-After`) not documented

**Friction observed**: KeeperHub documents rate-limit policy (`/api/authentication` lists 100 req/min authenticated, 10 req/min unauthenticated) and surfaces a `RATE_LIMITED` error code with exponential-backoff guidance (`/api/errors`). That's the right starting posture. But for SDK auto-throttling, two response-side primitives are missing:

- **Soft signal**: an `X-RateLimit-Remaining` (or `X-RateLimit-Reset`) header on every response so the SDK can throttle proactively before hitting 429.
- **Hard signal**: a `Retry-After` header on the 429 response so the SDK can back off the exact recommended duration instead of guessing with exponential backoff.

Without these headers, every SDK has to either guess the budget (under-utilizing the limit) or push until it gets 429s (a noisy way to discover the ceiling). Our `KeeperHubClient` polls 1s/2s/4s and hopes it stays under 100/min — works in steady state but fragile under burst traffic.

**Reproducer**: inspect the response headers from any `GET /api/workflows/executions/:executionId/status` call. Neither `X-RateLimit-Remaining` nor `Retry-After` appears in the documented response contract.

**Suggested change**:

1. Always return `X-RateLimit-Remaining` + `X-RateLimit-Reset` headers (RFC-aligned naming).
2. Always include `Retry-After` on 429 responses.
3. Document the headers in `/api/authentication` next to the policy section so SDK authors find them when they're already reading about limits.
4. Recommend SDK polling cadence in docs (with these headers, the SDK can self-tune; without them, KH can at least suggest 4s/8s as the default).

**Criticality**: **LOW–MEDIUM** — policy + 429 already work; missing response headers force every prod solver integrator to either over-poll-then-back-off or under-poll-defensively.

---

### KH-7: Execution cancellation has CLI parity but no documented HTTP endpoint

**Friction observed**: Cancellation exists at the product level — the `kh run cancel` CLI command is documented and the execution status enum includes `cancelled`. But the HTTP API surface doesn't document an equivalent endpoint:

- `DELETE /api/workflows/{workflowId}` deletes the **workflow definition**, not a running execution.
- There's no documented `POST /api/workflows/executions/{executionId}/cancel` (or equivalent).

This means SDK consumers building solvers can't cancel a server-side execution after `submitFill` has been called — the workflow keeps running and may broadcast a tx after the solver has moved on (e.g., because it received a duplicate intent or saw the spread close). Our `KeeperHubClient` supports `AbortSignal` but it can only stop local polling, not cancel the server-side execution.

**Reproducer**: try to cancel a running execution via the HTTP API. The CLI (`kh run cancel <executionId>`) works; the documented HTTP endpoints don't expose the equivalent.

**Suggested change**:

1. Add `POST /api/workflows/executions/{executionId}/cancel` — race against the broadcast.
2. Document cancellation semantics: races between cancel + broadcast, idempotency, what terminal status is set (presumably `cancelled`).
3. Achieve CLI ↔ HTTP parity: every `kh run` subcommand should have a documented HTTP equivalent so SDK consumers don't have to shell out.
4. Once available, `AbortSignal` in `KeeperHubClient.submitFill` can cancel the server-side workflow in addition to stopping local polling.

**Criticality**: **LOW** — most solvers don't need this in v0; production solvers running on duplicate-intent dedup logic or fast-spread-closure will hit it. Closes the CLI/HTTP parity gap as a side benefit.

---

## Methodology

We are committed to honest, actionable feedback:

- **Specific** — names the exact endpoint, file, or behavior
- **Reproducible** — copy-paste reproducer included
- **Actionable** — proposed change is implementable
- **Honest** — no exaggeration ("HIGH criticality" only when truly blocking)
- **Constructive** — frames as proposal, not complaint

Each item is added when we encounter it during real implementation — NOT speculatively.

The SDK code that exercises each friction point is at `packages/sdk/src/keeperhub/client.ts`; the test suite at `packages/sdk/test/keeperhub/client.test.ts` shows our assumptions about the wire format made concrete.

---

## Closing

The KeeperHub track is high-leverage for solver builders — MEV-protected fill submission unlocks sustainable solver economics. We'd be excited to:

- Validate our wire-format guesses against your real spec.
- Contribute the KeeperHubClient to the broader solver-SDK ecosystem (MIT-licensed, ready for upstream adoption).
- Co-author docs / cookbook pages on the integration patterns above.
