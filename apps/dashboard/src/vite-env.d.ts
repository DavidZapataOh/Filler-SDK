/// <reference types="vite/client" />

/**
 * Dashboard env vars consumed via `import.meta.env`. All are optional —
 * when unset, the corresponding hook returns the empty / disconnected
 * state and the UI falls back to placeholder copy. This keeps the
 * dashboard usable for static viewing (e.g. judges browsing the
 * deployed page) without a running solver.
 */
interface ImportMetaEnv {
  /**
   * Treasury-rebalance dashboard emitter base URL. Default port `:8080`
   * when running `bun start` on the scaffolded treasury-rebalance solver
   * (Sprint 04 Plan 05). Example: `http://localhost:8080`.
   * The hook appends `/events` for the SSE stream.
   */
  readonly VITE_SPREAD_EMITTER_URL?: string;

  /**
   * jit-hints indexer base URL (Sprint 02). Example: `http://localhost:42069`.
   * The hook appends `/depth/stream?...` for the SSE depth stream.
   */
  readonly VITE_DEPTH_INDEXER_URL?: string;

  /**
   * Default pool for the JIT depth chart. Falls back to a representative
   * Unichain pool when unset.
   */
  readonly VITE_DEPTH_POOL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
