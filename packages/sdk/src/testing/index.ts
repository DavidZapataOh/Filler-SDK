/**
 * `@filler-sdk/sdk/testing` — testing utilities. Imported by:
 *
 *   - solver test suites that mock the SDK's surfaces with `createMock*`.
 *   - solver test suites that need typed `Intent`/`FillParams`/etc. fixtures.
 *   - integration tests that spin up Anvil for fork-mode runs.
 *   - `create-filler` CLI starter (Sprint 04) — its template tests use these
 *     so newly-bootstrapped solvers ship with a working test suite.
 *
 * **Runtime requirements**:
 *   - Mocks (`createMock*`) need `vitest` available — it's an optional peer
 *     dep, so non-test consumers don't pay the cost. Importing `/testing`
 *     from a non-test runtime fails clearly via the missing peer.
 *   - Anvil helpers need Node + the `anvil` binary (Foundry). `isAnvilAvailable()`
 *     gates `it.skipIf(...)` blocks for env-aware tests.
 *
 * Tree-shaking: importing the main entry (`@filler-sdk/sdk`) does NOT pull
 * in this module — the size budget for /testing is 20 KB and the package's
 * `sideEffects: false` lets bundlers drop it cleanly.
 */

// === Type-only re-exports — let consumers author against canonical SDK types ==
export type {
  BondClientHandle,
  ChainStatus,
  DepthHint,
  DepthQuery,
  Filler,
  FillerConfig,
  FillerLogger,
  FillParams,
  FillResult,
  Intent,
  IntentFilter,
  IntentFilterCriteria,
  IntentFilterPredicate,
  PoolInfo,
  PoolKey,
  ResolvedFillerConfig,
  ResolvedOutput,
  SimulationResult,
  SubmitFillOptions,
  TokenAmount,
} from '../types';

// === Fixture builders ===================================================
export {
  TEST_ADDRESSES,
  mockChainStatus,
  mockDepthHint,
  mockFillParams,
  mockFillResult,
  mockIntent,
  mockPoolInfo,
  mockPoolKey,
  mockResolvedOutput,
  mockTokenAmount,
} from './fixtures';

// === Mock factories =====================================================
export {
  type KeeperHubClientShape,
  type MockFillerOverrides,
  createMockBondClient,
  createMockFiller,
  createMockIndexerClient,
  createMockKeeperHubClient,
} from './mocks';

// === Test logger ========================================================
export { type TestLogCall, type TestLogger, createTestLogger } from './logger';

// === Anvil helpers (Node-only) ==========================================
export {
  ANVIL_CHAIN_ID,
  ANVIL_DEV_PRIVATE_KEY,
  type AnvilHandle,
  type CreateAnvilFillerOptions,
  type StartAnvilOptions,
  createAnvilFiller,
  isAnvilAvailable,
  startAnvil,
  stopAnvil,
} from './anvil';

// === Mock intent source (re-export from Plan 03) ========================
//
// `mockIntentSource` already lives at `src/intents/mockSource.ts` (Plan 03's
// IntentStream relies on it for engine tests). Re-exporting through `/testing`
// makes it discoverable from the canonical entry without forcing solver
// authors into a deep import.
export {
  type MockIntentSource,
  type MockIntentSourceOptions,
  createMockIntentSource,
} from '../intents/mockSource';
