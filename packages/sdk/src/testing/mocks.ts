/**
 * Mock factories for the SDK's public surfaces. Each factory returns an
 * interface-compliant object whose methods are `vi.fn()` spies — assert
 * on `mockClient.someMethod.mock.calls` after running your unit under test.
 *
 * **Why factories instead of class instances?** Real `BondClient`,
 * `IndexerClient`, etc. require viem clients (PublicClient + WalletClient)
 * + a logger + a network. A mock that spawns viem just to satisfy a type
 * is more friction than help. The factories return plain objects that
 * satisfy the SDK's interfaces (`BondClientHandle`, `IndexerSurface`, etc.)
 * — TypeScript's structural typing accepts them anywhere the real type
 * is wanted.
 *
 * **Why `vi.fn()` instead of plain stubs?** Test-author ergonomics. With
 * vi.fn you get `.mock.calls` for assertions, `.mockResolvedValueOnce` for
 * sequenced returns, etc. The downside: this module imports `vitest` at
 * runtime, so it can ONLY be used from a vitest-running context (test
 * files, vitest beforeAll setups, etc.). vitest is declared as an optional
 * peer dep. Bundlers that import non-`/testing` SDK entries don't pay the
 * vitest cost.
 */

import { vi } from 'vitest';

import type { ChainId } from '../chains';
import type {
  BondClientHandle,
  ChainContractAddresses,
  Filler,
  FillerLogger,
  FillSurface,
  IndexerSurface,
  IntentSurface,
  ResolvedFillerConfig,
} from '../types';

import {
  TEST_ADDRESSES,
  mockChainStatus,
  mockDepthHint,
  mockFillParams,
  mockFillResult,
  mockPoolInfo,
} from './fixtures';

// === Mock options =======================================================

export interface MockFillerOverrides {
  chainId?: ChainId;
  account?: `0x${string}`;
  intents?: Partial<IntentSurface>;
  fills?: Partial<FillSurface>;
  indexer?: Partial<IndexerSurface>;
  bond?: Partial<BondClientHandle>;
  /** Replace the resolved config (typically just to swap addresses for an Anvil-deployed test). */
  config?: Partial<ResolvedFillerConfig>;
}

// === createMockFiller ===================================================

export function createMockFiller(overrides: MockFillerOverrides = {}): Filler {
  const chainId = overrides.chainId ?? 130;
  const account = overrides.account ?? TEST_ADDRESSES.SWAPPER;

  const intents = createMockIntentSurface(overrides.intents);
  const fills = createMockFillSurface(overrides.fills);
  const indexer = createMockIndexerClient(overrides.indexer);
  const bond = createMockBondClient(overrides.bond, { chainId, account });

  const config: ResolvedFillerConfig = {
    chainId,
    account,
    transport: { publicClient: {}, walletClient: {} },
    addresses: makeMockAddresses(),
    indexer: {
      baseUrl: 'http://localhost:42069',
      authToken: '',
      timeoutMs: 5_000,
    },
    keeperHub: null,
    intentSource: null,
    intentQueueSize: 100,
    logger: createMockLoggerInternal(),
    ...overrides.config,
  };

  let shutdownCalled = false;
  const shutdown = vi.fn(async () => {
    shutdownCalled = true;
  });
  void shutdownCalled; // silenced — captured by spy

  // Flat-surface methods. `prepareFill` is a Filler-level method, not part
  // of `FillSurface` (which only declares execute + simulate); we mock it
  // independently with a sensible default. Override via `overrides.fills`
  // if you need richer behavior — those flow into the grouped surface AND
  // the flat methods stay in sync via the shared spies below.
  const subscribeIntents = vi.fn(intents.subscribe);
  const prepareFill = vi.fn(async () => mockFillParams());
  const submitFill = vi.fn(fills.execute);

  return {
    chainId,
    account,
    config,
    intents,
    fills,
    indexer,
    bond,
    subscribeIntents,
    prepareFill,
    submitFill,
    shutdown,
    close: shutdown,
  };
}

// === createMockBondClient ===============================================

export function createMockBondClient(
  overrides: Partial<BondClientHandle> = {},
  ctx: { chainId?: ChainId; account?: `0x${string}` } = {},
): BondClientHandle {
  const chainId = ctx.chainId ?? 130;
  const account = ctx.account ?? TEST_ADDRESSES.SWAPPER;
  const TX = ('0x' + '1'.repeat(64)) as `0x${string}`;

  return {
    chainId,
    bondContract: makeMockAddresses().fillerBond,
    fillerContract: makeMockAddresses().filler,
    account,
    totalStake: vi.fn(async () => 0n),
    activeStake: vi.fn(async () => 0n),
    pendingUnstake: vi.fn(async () => 0n),
    slashedTotal: vi.fn(async () => 0n),
    stake: vi.fn(async () => TX),
    requestUnstake: vi.fn(async () => TX),
    withdraw: vi.fn(async () => TX),
    ...overrides,
  };
}

// === createMockIndexerClient ============================================

export function createMockIndexerClient(
  overrides: Partial<IndexerSurface> = {},
): IndexerSurface {
  return {
    depth: vi.fn(async () => mockDepthHint()),
    findPool: vi.fn(async () => mockPoolInfo()),
    subscribeDepth: vi.fn(() => () => undefined),
    health: vi.fn(async () => ({
      status: 'ok' as const,
      chains: [mockChainStatus()],
    })),
    ...overrides,
  };
}

// === createMockKeeperHubClient ==========================================

/**
 * KeeperHubClient is a class, not an interface, so we expose the structural
 * shape that `FillEngine` actually uses (`submitFill` only) — duck-typed to
 * the real client. Pass via `createMockFiller({ config: { keeperHub: ... }})`
 * is NOT how the engine accesses it; the real plumbing is `FillEngine.#keeperHub`
 * which is set at construction. For unit tests of the engine, pass this mock
 * directly to `new FillEngine({ ..., keeperHub: createMockKeeperHubClient() })`.
 */
export interface KeeperHubClientShape {
  submitFill: ReturnType<typeof vi.fn>;
  getStatus?: ReturnType<typeof vi.fn>;
}

export function createMockKeeperHubClient(
  overrides: Partial<KeeperHubClientShape> = {},
): KeeperHubClientShape {
  return {
    submitFill: vi.fn(async () => mockFillResult()),
    getStatus: vi.fn(async () => ({
      workflowId: 'wf-mock',
      status: 'completed' as const,
      result: {
        txHash: TEST_ADDRESSES.TX_HASH,
        blockNumber: '21000000',
        gasUsed: '500000',
      },
    })),
    ...overrides,
  };
}

// === Internal helpers ===================================================

function createMockIntentSurface(
  overrides: Partial<IntentSurface> = {},
): IntentSurface {
  return {
    subscribe: vi.fn(() => () => undefined),
    list: vi.fn(async () => []),
    ...overrides,
  };
}

function createMockFillSurface(overrides: Partial<FillSurface> = {}): FillSurface {
  return {
    execute: vi.fn(async () => mockFillResult()),
    simulate: vi.fn(async () => ({ ok: true as const })),
    ...overrides,
  };
}

function createMockLoggerInternal(): FillerLogger {
  return {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function makeMockAddresses(): ChainContractAddresses {
  return {
    poolManager: '0x1f98400000000000000000000000000000000004',
    permit2: '0x000000000022d473030f116ddee9f6b43ac78ba3',
    reactor: '0x3333333333333333333333333333333333333333',
    filler: '0x4444444444444444444444444444444444444444',
    fillerBond: '0x5555555555555555555555555555555555555555',
  };
}
