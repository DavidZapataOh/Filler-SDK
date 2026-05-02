import { describe, expect, test } from 'vitest';

import {
  BroadcastFailedError,
  ConfigInvalidError,
  type DepthHint,
  type DepthQuery,
  FillerError,
  IntentExpiredError,
  type PoolInfo,
  RPCError,
  silenceLoggerForTests,
} from '../../src';
import { FillEngine, applyGasMultiplier } from '../../src/fills/engine';
import { logger } from '../../src/logger';
import { makeDepthHint, makeIntent, makePoolInfo, TEST_ADDRESSES } from './fixtures';

silenceLoggerForTests();

// === Mocks ===============================================================

interface MockIndexerOptions {
  pool?: PoolInfo | null;
  depth?: DepthHint;
  findPoolThrows?: boolean;
  depthThrows?: boolean;
}

function createMockIndexer(opts: MockIndexerOptions = {}) {
  return {
    findPool: async (
      _input: `0x${string}`,
      _output: `0x${string}`,
      _chainId: number,
    ): Promise<PoolInfo | null> => {
      if (opts.findPoolThrows === true) throw new Error('indexer down');
      // Distinguish "not specified" (use default) from "explicit null" (return null).
      if ('pool' in opts) return opts.pool ?? null;
      return makePoolInfo();
    },
    depth: async (_q: DepthQuery): Promise<DepthHint> => {
      if (opts.depthThrows === true) throw new Error('indexer 502');
      return opts.depth ?? makeDepthHint();
    },
    health: async () => ({ status: 'ok' as const, chains: [] }),
  };
}

interface MockClientsOptions {
  account?: { address: `0x${string}` } | undefined;
  /** simulateContract behavior. */
  simulate?: 'ok' | 'revert' | Error;
  /** estimateContractGas return value (default 100_000n). */
  estimateGas?: bigint | Error;
  /** writeContract behavior — sequence of attempts. Each entry is either
   *  a tx hash to return, or an Error to throw. */
  writeAttempts?: Array<`0x${string}` | Error>;
  /** receipt.status when waitForTransactionReceipt is called. */
  receiptStatus?: 'success' | 'reverted';
}

interface MockReceipt {
  status: 'success' | 'reverted';
  blockNumber: bigint;
  effectiveGasPrice: bigint;
  gasUsed: bigint;
}

function createMockClients(opts: MockClientsOptions = {}) {
  // Distinguish "not specified" (use default account) from "explicit undefined"
  // (no account bound — for the no-account-bound test).
  const account =
    'account' in opts
      ? opts.account
      : { address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as `0x${string}` };
  let writeIndex = 0;
  const sequence = opts.writeAttempts ?? ['0xtx1' as `0x${string}`];

  const publicClient = {
    simulateContract: async () => {
      if (opts.simulate === 'revert') throw new Error('execution reverted');
      if (opts.simulate instanceof Error) throw opts.simulate;
      return { request: {}, result: undefined };
    },
    estimateContractGas: async (): Promise<bigint> => {
      if (opts.estimateGas instanceof Error) throw opts.estimateGas;
      return opts.estimateGas ?? 100_000n;
    },
    waitForTransactionReceipt: async (): Promise<MockReceipt> => ({
      status: opts.receiptStatus ?? 'success',
      blockNumber: 1_000n,
      effectiveGasPrice: 2_000_000_000n,
      gasUsed: 80_000n,
    }),
  };

  let writeCalls = 0;
  const walletClient = {
    account,
    writeContract: async (): Promise<`0x${string}`> => {
      writeCalls++;
      const next = sequence[writeIndex++] ?? sequence[sequence.length - 1];
      if (next instanceof Error) throw next;
      return next as `0x${string}`;
    },
  };

  return {
    publicClient,
    walletClient,
    get writeCalls() {
      return writeCalls;
    },
  };
}

function makeEngine(opts: {
  indexer?: ReturnType<typeof createMockIndexer>;
  clients?: ReturnType<typeof createMockClients>;
  keeperHub?: null | { fake: true };
}) {
  const indexer = opts.indexer ?? createMockIndexer();
  const clients = opts.clients ?? createMockClients();
  return new FillEngine({
    publicClient: clients.publicClient,
    walletClient: clients.walletClient,
    addresses: {
      filler: TEST_ADDRESSES.FILLER,
      reactor: TEST_ADDRESSES.REACTOR,
      poolManager: TEST_ADDRESSES.POOL_MANAGER,
    },
    indexer: indexer as never,
    keeperHub: (opts.keeperHub as never) ?? null,
    logger,
  });
}

// === applyGasMultiplier ==================================================

describe('applyGasMultiplier', () => {
  test('1.0 = identity (no headroom)', () => {
    expect(applyGasMultiplier(100_000n, 1)).toBe(100_000n);
  });

  test('1.2 = +20%, rounded up', () => {
    expect(applyGasMultiplier(100_000n, 1.2)).toBe(120_000n);
  });

  test('1.5 = +50%', () => {
    expect(applyGasMultiplier(100_000n, 1.5)).toBe(150_000n);
  });

  test('rounds up so we never undershoot', () => {
    // 1.0001 × 99_999 = 99_999.9999... → rounds up to 100_000.
    expect(applyGasMultiplier(99_999n, 1.0001)).toBeGreaterThanOrEqual(100_000n);
  });

  test('multiplier < 1 is rejected (config bug)', () => {
    expect(() => applyGasMultiplier(100_000n, 0.9)).toThrow(/CONFIG_INVALID|>= 1/);
  });

  test('NaN / Infinity rejected', () => {
    expect(() => applyGasMultiplier(100_000n, Number.NaN)).toThrow();
    expect(() => applyGasMultiplier(100_000n, Number.POSITIVE_INFINITY)).toThrow();
  });
});

// === prepare =============================================================

describe('FillEngine.prepare', () => {
  test('returns null for an expired intent', async () => {
    const engine = makeEngine({});
    const result = await engine.prepare(
      makeIntent({ deadline: 0n }),
    );
    expect(result).toBeNull();
  });

  test('returns null for an observational intent (rawOrder sentinel)', async () => {
    const engine = makeEngine({});
    const result = await engine.prepare(
      makeIntent({ rawOrder: '0x', signature: '0x' }),
    );
    expect(result).toBeNull();
  });

  test('returns null when indexer.findPool returns null', async () => {
    const engine = makeEngine({
      indexer: createMockIndexer({ pool: null }),
    });
    const result = await engine.prepare(makeIntent());
    expect(result).toBeNull();
  });

  test('returns null when indexer.findPool throws', async () => {
    const engine = makeEngine({
      indexer: createMockIndexer({ findPoolThrows: true }),
    });
    const result = await engine.prepare(makeIntent());
    expect(result).toBeNull();
  });

  test('returns null when indexer.depth throws', async () => {
    const engine = makeEngine({
      indexer: createMockIndexer({ depthThrows: true }),
    });
    const result = await engine.prepare(makeIntent());
    expect(result).toBeNull();
  });

  test('returns null when expectedFeeCapture is zero (unprofitable)', async () => {
    const engine = makeEngine({
      indexer: createMockIndexer({
        depth: makeDepthHint({ expectedFeeCapture: 0n }),
      }),
    });
    const result = await engine.prepare(makeIntent());
    expect(result).toBeNull();
  });

  test('returns null when calibration rejects an inverted indexer hint', async () => {
    // Plan 05 snaps misaligned ticks instead of rejecting them; the only
    // calibration-side throw left is a malformed hint where tickLower >=
    // tickUpper (an indexer bug we shouldn't paper over).
    const engine = makeEngine({
      indexer: createMockIndexer({
        depth: makeDepthHint({ tickLower: 240, tickUpper: -240 }),
      }),
    });
    const result = await engine.prepare(makeIntent());
    expect(result).toBeNull();
  });

  test('returns null when simulation reverts', async () => {
    const engine = makeEngine({
      clients: createMockClients({ simulate: 'revert' }),
    });
    const result = await engine.prepare(makeIntent());
    expect(result).toBeNull();
  });

  test('returns FillParams with derived fields when everything passes', async () => {
    const engine = makeEngine({});
    const result = await engine.prepare(makeIntent());
    expect(result).not.toBeNull();
    if (result === null) throw new Error('unreachable');
    expect(result.poolKey.currency0).toBe(TEST_ADDRESSES.TOKEN_A);
    expect(result.poolKey.fee).toBe(3000);
    expect(result.zeroForOne).toBe(true);
    // Plan 05 default safetyMarginTicks=1 widens the indexer hint by one
    // tickSpacing (60) per side: [-120, 120] → [-180, 180].
    expect(result.tickLower).toBe(-180);
    expect(result.tickUpper).toBe(180);
    expect(result.feesCaptured).toBe(1_000_000n);
    expect(result.outputAmount).toBe(500_000_000n);
  });

  test('returns null when intent has no outputs (defensive)', async () => {
    const engine = makeEngine({});
    const result = await engine.prepare(makeIntent({ outputs: [] }));
    expect(result).toBeNull();
  });

  test('zeroForOne is false when input matches currency1', async () => {
    const engine = makeEngine({
      indexer: createMockIndexer({
        pool: makePoolInfo({
          currency0: TEST_ADDRESSES.TOKEN_B, // swap order
          currency1: TEST_ADDRESSES.TOKEN_A,
        }),
      }),
    });
    const result = await engine.prepare(makeIntent());
    expect(result?.zeroForOne).toBe(false);
  });
});

// === simulate ============================================================

describe('FillEngine.simulate', () => {
  test('observational intent — ok:false with sentinel reason', async () => {
    const engine = makeEngine({});
    const result = await engine.simulate(
      makeIntent({ rawOrder: '0x', signature: '0x' }),
      {
        poolKey: {
          currency0: TEST_ADDRESSES.TOKEN_A,
          currency1: TEST_ADDRESSES.TOKEN_B,
          fee: 3000,
          tickSpacing: 60,
          hooks: TEST_ADDRESSES.HOOKS,
        },
        inputCurrency: TEST_ADDRESSES.TOKEN_A,
        outputCurrency: TEST_ADDRESSES.TOKEN_B,
        inputAmount: 1n,
        outputAmount: 1n,
        zeroForOne: true,
        tickLower: -60,
        tickUpper: 60,
        liquidityDelta: 1n,
        feesCaptured: 1n,
        deadline: 9_999_999_999n,
      },
    );
    expect(result.ok).toBe(false);
    expect(result.revertReason).toMatch(/observational/i);
  });

  test('happy path — ok:true', async () => {
    const engine = makeEngine({});
    const params = (await engine.prepare(makeIntent()))!;
    const result = await engine.simulate(makeIntent(), params);
    expect(result.ok).toBe(true);
  });

  test('revert path — ok:false', async () => {
    const engine = makeEngine({
      clients: createMockClients({ simulate: 'revert' }),
    });
    const params = (await makeEngine({}).prepare(makeIntent()))!;
    const result = await engine.simulate(makeIntent(), params);
    expect(result.ok).toBe(false);
    expect(result.revertReason).toBeDefined();
  });
});

// === execute =============================================================

describe('FillEngine.execute', () => {
  test('rejects observational intents loud (BroadcastFailedError)', async () => {
    const engine = makeEngine({});
    const params = (await engine.prepare(makeIntent()))!;
    await expect(
      engine.execute(makeIntent({ rawOrder: '0x', signature: '0x' }), params),
    ).rejects.toBeInstanceOf(BroadcastFailedError);
  });

  test('rejects expired intents loud (IntentExpiredError)', async () => {
    const engine = makeEngine({});
    const params = (await engine.prepare(makeIntent()))!;
    await expect(
      engine.execute(makeIntent({ deadline: 0n }), params),
    ).rejects.toBeInstanceOf(IntentExpiredError);
  });

  test('happy path — returns FillResult on success', async () => {
    const clients = createMockClients({});
    const engine = makeEngine({ clients });
    const params = (await engine.prepare(makeIntent()))!;
    const result = await engine.execute(makeIntent(), params);
    expect(result.txHash).toBe('0xtx1');
    expect(result.blockNumber).toBe(1_000n);
    expect(result.gasUsed).toBe(80_000n);
    expect(result.feeCapturedAmount).toBe(params.feesCaptured);
    expect(clients.writeCalls).toBe(1);
  });

  test('retries 2x on transient writeContract error then succeeds', async () => {
    const clients = createMockClients({
      writeAttempts: [
        new Error('connection reset'),
        new Error('rpc 503'),
        '0xtxRetried' as `0x${string}`,
      ],
    });
    const engine = makeEngine({ clients });
    const params = (await makeEngine({}).prepare(makeIntent()))!;
    const result = await engine.execute(makeIntent(), params);
    expect(result.txHash).toBe('0xtxRetried');
    expect(clients.writeCalls).toBe(3);
  }, 10_000);

  test('throws RPCError after MAX_ATTEMPTS exhausted', async () => {
    const clients = createMockClients({
      writeAttempts: [
        new Error('rpc down'),
        new Error('rpc down'),
        new Error('rpc down'),
      ],
    });
    const engine = makeEngine({ clients });
    const params = (await makeEngine({}).prepare(makeIntent()))!;
    await expect(engine.execute(makeIntent(), params)).rejects.toBeInstanceOf(
      RPCError,
    );
  }, 10_000);

  test('on-chain revert — BroadcastFailedError, no retry', async () => {
    const clients = createMockClients({
      receiptStatus: 'reverted',
    });
    const engine = makeEngine({ clients });
    const params = (await makeEngine({}).prepare(makeIntent()))!;
    await expect(engine.execute(makeIntent(), params)).rejects.toBeInstanceOf(
      BroadcastFailedError,
    );
    // Should NOT retry on a deterministic revert.
    expect(clients.writeCalls).toBe(1);
  });

  test('throws when walletClient has no account bound', async () => {
    const clients = createMockClients({ account: undefined });
    const engine = makeEngine({ clients });
    const params = (await makeEngine({}).prepare(makeIntent()))!;
    await expect(engine.execute(makeIntent(), params)).rejects.toBeInstanceOf(
      FillerError,
    );
  });

  test('rejects useKeeperHub:true with a Plan-08 pointer', async () => {
    const engine = makeEngine({ keeperHub: { fake: true } });
    const params = (await makeEngine({}).prepare(makeIntent()))!;
    await expect(
      engine.execute(makeIntent(), params, { useKeeperHub: true }),
    ).rejects.toThrow(/Plan 08/);
  });

  test('applies a custom gasMultiplier', async () => {
    let observedGas: bigint | undefined;
    const clients = createMockClients({});
    // Wrap writeContract to capture the gas argument.
    const originalWrite = clients.walletClient.writeContract;
    clients.walletClient.writeContract = async (args: {
      gas?: bigint;
    }): Promise<`0x${string}`> => {
      observedGas = args.gas;
      return originalWrite(args as never);
    };
    const engine = makeEngine({ clients });
    const params = (await engine.prepare(makeIntent()))!;
    await engine.execute(makeIntent(), params, { gasMultiplier: 1.5 });
    // estimate is 100_000n; 1.5× = 150_000n.
    expect(observedGas).toBe(150_000n);
  });

  test('rejects invalid gasMultiplier (config bug)', async () => {
    const engine = makeEngine({});
    const params = (await engine.prepare(makeIntent()))!;
    await expect(
      engine.execute(makeIntent(), params, { gasMultiplier: 0.5 }),
    ).rejects.toBeInstanceOf(ConfigInvalidError);
  });
});
