/**
 * Replay fixture types — deterministic demo timelines.
 *
 * Each fixture is a frozen JSON file shipped with the bundle. The replay
 * iterables yield events VERBATIM from the fixture (including pre-computed
 * `totalUSD` running sums + the original `timestampMs` ms-epoch values) so
 * the visual is byte-identical across runs. No wall-clock-derived timestamps,
 * no random IDs.
 *
 * Why pre-compute `totalUSD` (cumulative): SpreadCounter consumes the
 * server-authoritative `totalUSD` as the source of truth (F-45). Replay
 * mode preserves that property — we precompute the running sum at fixture
 * authoring time so the same reconnect-safety guarantees hold offline.
 */

export interface SpreadFixtureEvent {
  /** Offset from replay start, in ms. */
  atMs: number;
  /** This fill's spread captured, in USD. */
  amountUSD: number;
  /** Cumulative since replay start. Pre-computed at fixture authoring. */
  totalUSD: number;
  /** Tx hash, `0x…` 64 hex. */
  txHash: `0x${string}`;
  /** UniswapX order hash, `0x…` 64 hex. */
  orderHash: `0x${string}`;
  /** Block number string. Frozen so the explorer link is stable across replays. */
  blockNumber: string;
  /** UNIX ms timestamp baked into the fixture. */
  timestampMs: number;
}

export interface DepthFixtureTick {
  tick: number;
  liquidity: number;
}

export interface DepthFixtureSnapshot {
  /** Offset from replay start, in ms. */
  atMs: number;
  ticks: DepthFixtureTick[];
  currentTick: number;
  /** When present, the chart highlights the JIT-add range. */
  jitRange?: { tickLower: number; tickUpper: number };
}

export interface ThreeFilesMarker {
  /** Offset from replay start, in ms. */
  atMs: number;
  /** Step value (0..4) the ThreeFilesReveal should snap to. */
  step: number;
}

export interface Fixture {
  /** Display name shown in the REPLAY badge. */
  name: string;
  /** Vertical the fixture represents — drives badge copy + matches a CLI vertical. */
  vertical: 'treasury-rebalance' | 'lvr-aware' | 'simple-jit';
  /** Total replay duration (ms). After this point the iterables are exhausted. */
  durationMs: number;
  spreadEvents: SpreadFixtureEvent[];
  depthSnapshots: DepthFixtureSnapshot[];
  threeFilesReveal: ThreeFilesMarker[];
}

export type FixtureKey = 'treasury' | 'lvr' | 'simple';
