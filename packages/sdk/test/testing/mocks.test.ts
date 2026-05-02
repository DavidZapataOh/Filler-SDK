import { describe, expect, test } from 'vitest';

import {
  type BondClientHandle,
  type Filler,
  type IndexerSurface,
  type SubmitFillOptions,
  createMockBondClient,
  createMockFiller,
  createMockIndexerClient,
  createMockKeeperHubClient,
} from '../../src/testing';

describe('testing/mocks — createMockFiller', () => {
  test('returns shape-compliant Filler', () => {
    const filler: Filler = createMockFiller();
    expect(filler.chainId).toBe(130);
    expect(typeof filler.account).toBe('string');
    expect(filler.config).toBeDefined();
    expect(filler.intents).toBeDefined();
    expect(filler.fills).toBeDefined();
    expect(filler.indexer).toBeDefined();
    expect(filler.bond).toBeDefined();
    expect(typeof filler.subscribeIntents).toBe('function');
    expect(typeof filler.prepareFill).toBe('function');
    expect(typeof filler.submitFill).toBe('function');
    expect(typeof filler.shutdown).toBe('function');
    expect(typeof filler.close).toBe('function');
  });

  test('shutdown + close are aliases', () => {
    const filler = createMockFiller();
    expect(filler.shutdown).toBe(filler.close);
  });

  test('overrides override only the fields supplied', () => {
    const filler = createMockFiller({
      chainId: 8453,
      account: '0xfeedfaceeefdfeedfaceeefdfeedfaceeefdfeed',
    });
    expect(filler.chainId).toBe(8453);
    expect(filler.account).toBe(
      '0xfeedfaceeefdfeedfaceeefdfeedfaceeefdfeed',
    );
  });

  test('flat methods are vi.fn spies that record calls', async () => {
    const filler = createMockFiller();
    const intent = (filler as unknown as { __intent: never }).__intent ?? {};
    void intent;
    const handler = (): void => undefined;
    filler.subscribeIntents({}, handler);
    expect(
      (filler.subscribeIntents as { mock: { calls: unknown[] } }).mock.calls
        .length,
    ).toBe(1);
  });

  test('intents.list returns [] by default', async () => {
    const filler = createMockFiller();
    const r = await filler.intents.list();
    expect(r).toEqual([]);
  });

  test('fills.execute returns a mock FillResult', async () => {
    const filler = createMockFiller();
    const result = await filler.fills.execute(
      undefined as never,
      undefined as never,
      undefined as SubmitFillOptions | undefined,
    );
    expect(result.txHash).toBeDefined();
    expect(typeof result.gasUsed).toBe('bigint');
  });

  test('overrides.indexer wins over default mock', async () => {
    const customDepth = { hint: { tickLower: -1234, tickUpper: 1234, liquidityDelta: 1n, expectedFeeCapture: 1n } } as never;
    const filler = createMockFiller({
      indexer: { depth: async () => customDepth },
    });
    const r = await filler.indexer.depth({
      pool: '0xabc',
      size: 1n,
      zeroForOne: true,
    } as never);
    expect(r).toEqual(customDepth);
  });

  test('overrides.bond wins over default mock', async () => {
    const filler = createMockFiller({
      bond: { activeStake: async () => 7_777_777n },
    });
    expect(await filler.bond.activeStake()).toBe(7_777_777n);
    // Other methods stay at default.
    expect(await filler.bond.totalStake()).toBe(0n);
  });
});

describe('testing/mocks — createMockBondClient', () => {
  test('returns BondClientHandle-compliant object', () => {
    const bond: BondClientHandle = createMockBondClient();
    expect(typeof bond.stake).toBe('function');
    expect(typeof bond.requestUnstake).toBe('function');
    expect(typeof bond.withdraw).toBe('function');
    expect(typeof bond.totalStake).toBe('function');
    expect(typeof bond.activeStake).toBe('function');
    expect(typeof bond.pendingUnstake).toBe('function');
    expect(typeof bond.slashedTotal).toBe('function');
  });

  test('returns sensible default tx hashes', async () => {
    const bond = createMockBondClient();
    const tx = await bond.stake(1_000n);
    expect(tx.length).toBe(66);
  });
});

describe('testing/mocks — createMockIndexerClient', () => {
  test('returns IndexerSurface-compliant object', () => {
    const indexer: IndexerSurface = createMockIndexerClient();
    expect(typeof indexer.depth).toBe('function');
    expect(typeof indexer.findPool).toBe('function');
    expect(typeof indexer.subscribeDepth).toBe('function');
    expect(typeof indexer.health).toBe('function');
  });

  test('default health returns ok status', async () => {
    const indexer = createMockIndexerClient();
    const r = await indexer.health();
    expect(r.status).toBe('ok');
    expect(r.chains.length).toBe(1);
  });
});

describe('testing/mocks — createMockKeeperHubClient', () => {
  test('returns submitFill + getStatus spies', () => {
    const kh = createMockKeeperHubClient();
    expect(typeof kh.submitFill).toBe('function');
    expect(typeof kh.getStatus).toBe('function');
  });

  test('default submitFill resolves to a mock FillResult', async () => {
    const kh = createMockKeeperHubClient();
    const r = await kh.submitFill();
    expect(r.txHash).toBeDefined();
    expect(typeof r.gasUsed).toBe('bigint');
  });
});
