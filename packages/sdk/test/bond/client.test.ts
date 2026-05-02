import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import {
  ConfigInvalidError,
  IntentExpiredError,
  InsufficientLiquidityError,
  RPCError,
  silenceLoggerForTests,
} from '../../src';
import { BondClient } from '../../src/bond/client';
import { logger } from '../../src/logger';

silenceLoggerForTests();

const BOND_CONTRACT = '0xb0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0' as const;
const FILLER_CONTRACT = '0xfffefffefffefffefffefffefffefffefffefffe' as const;
const ACCOUNT = '0xacacacacacacacacacacacacacacacacacacacac' as const;
const UINT256_MAX = (1n << 256n) - 1n;

interface MockClientsOpts {
  account?: { address: `0x${string}` } | undefined;
  // readContract mock: stakeOf(filler, account) → bigint
  // pendingWithdrawal(filler, account) → [bigint, bigint]
  // totalSlashed → bigint
  reads?: Partial<{
    stakeOf: bigint;
    pendingWithdrawalAmount: bigint;
    pendingWithdrawalAvailableAt: bigint;
    totalSlashed: bigint;
  }>;
  // writeContract: returns this hash; throw an Error to simulate failure.
  write?: `0x${string}` | Error;
  readThrows?: boolean;
}

function makeClients(opts: MockClientsOpts = {}) {
  const account =
    'account' in opts
      ? opts.account
      : { address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as `0x${string}` };
  const reads = opts.reads ?? {};

  const readContract = vi.fn(
    async (args: { functionName: string }) => {
      if (opts.readThrows === true) throw new Error('rpc down');
      switch (args.functionName) {
        case 'stakeOf':
          return reads.stakeOf ?? 0n;
        case 'pendingWithdrawal':
          return [
            reads.pendingWithdrawalAmount ?? 0n,
            reads.pendingWithdrawalAvailableAt ?? UINT256_MAX,
          ] as readonly [bigint, bigint];
        case 'totalSlashed':
          return reads.totalSlashed ?? 0n;
        default:
          throw new Error(`unexpected readContract: ${args.functionName}`);
      }
    },
  );

  const writeContract = vi.fn(async () => {
    if (opts.write instanceof Error) throw opts.write;
    return opts.write ?? ('0xtxhash' as `0x${string}`);
  });

  return {
    publicClient: { readContract },
    walletClient: { account, writeContract },
    readContract,
    writeContract,
  };
}

function makeBond(opts: MockClientsOpts = {}) {
  const clients = makeClients(opts);
  const bond = new BondClient({
    chainId: 130,
    bondContract: BOND_CONTRACT,
    fillerContract: FILLER_CONTRACT,
    account: ACCOUNT,
    publicClient: clients.publicClient,
    walletClient: clients.walletClient,
    logger,
  });
  return { bond, ...clients };
}

// === Identity =============================================================

describe('BondClient identity', () => {
  test('exposes bondContract / fillerContract / account / chainId', () => {
    const { bond } = makeBond();
    expect(bond.chainId).toBe(130);
    expect(bond.bondContract).toBe(BOND_CONTRACT);
    expect(bond.fillerContract).toBe(FILLER_CONTRACT);
    expect(bond.account).toBe(ACCOUNT);
  });
});

// === Reads ================================================================

describe('BondClient.activeStake', () => {
  test('reads stakeOf(filler, account)', async () => {
    const { bond, readContract } = makeBond({
      reads: { stakeOf: 7_000_000_000_000_000_000n },
    });
    const r = await bond.activeStake();
    expect(r).toBe(7_000_000_000_000_000_000n);
    expect(readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: 'stakeOf',
        args: [FILLER_CONTRACT, ACCOUNT],
      }),
    );
  });

  test('wraps RPC failure into RPCError', async () => {
    const { bond } = makeBond({ readThrows: true });
    await expect(bond.activeStake()).rejects.toBeInstanceOf(RPCError);
  });
});

describe('BondClient.pendingUnstake', () => {
  test('returns the amount component of pendingWithdrawal', async () => {
    const { bond } = makeBond({
      reads: {
        pendingWithdrawalAmount: 500n,
        pendingWithdrawalAvailableAt: 999n,
      },
    });
    const r = await bond.pendingUnstake();
    expect(r).toBe(500n);
  });

  test('returns 0n when no pending request', async () => {
    const { bond } = makeBond({});
    const r = await bond.pendingUnstake();
    expect(r).toBe(0n);
  });
});

describe('BondClient.totalStake', () => {
  test('returns activeStake + pendingUnstake', async () => {
    const { bond } = makeBond({
      reads: { stakeOf: 1_000n, pendingWithdrawalAmount: 200n },
    });
    const r = await bond.totalStake();
    expect(r).toBe(1_200n);
  });
});

describe('BondClient.slashedTotal', () => {
  test('returns the global totalSlashed', async () => {
    const { bond, readContract } = makeBond({
      reads: { totalSlashed: 999n },
    });
    const r = await bond.slashedTotal();
    expect(r).toBe(999n);
    expect(readContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: 'totalSlashed', args: [] }),
    );
  });
});

describe('BondClient.cooldownEndsAt', () => {
  test('returns null when no pending unstake (UINT256_MAX sentinel)', async () => {
    const { bond } = makeBond({
      reads: { pendingWithdrawalAvailableAt: UINT256_MAX },
    });
    const r = await bond.cooldownEndsAt();
    expect(r).toBeNull();
  });

  test('returns the timestamp when there IS a pending unstake', async () => {
    const { bond } = makeBond({
      reads: { pendingWithdrawalAvailableAt: 1_700_000_000n },
    });
    const r = await bond.cooldownEndsAt();
    expect(r).toBe(1_700_000_000n);
  });
});

// === Writes ===============================================================

describe('BondClient.stake', () => {
  test('rejects zero amount', async () => {
    const { bond } = makeBond();
    await expect(bond.stake(0n)).rejects.toBeInstanceOf(ConfigInvalidError);
  });

  test('rejects negative amount', async () => {
    const { bond } = makeBond();
    await expect(bond.stake(-1n)).rejects.toBeInstanceOf(ConfigInvalidError);
  });

  test('rejects when walletClient has no account bound', async () => {
    const { bond } = makeBond({ account: undefined });
    await expect(bond.stake(1_000n)).rejects.toBeInstanceOf(ConfigInvalidError);
  });

  test('happy path calls writeContract with value=amount + correct args', async () => {
    const { bond, writeContract } = makeBond();
    const tx = await bond.stake(1_000_000_000_000_000_000n);
    expect(tx).toBe('0xtxhash');
    expect(writeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: BOND_CONTRACT,
        functionName: 'stake',
        args: [FILLER_CONTRACT],
        value: 1_000_000_000_000_000_000n,
      }),
    );
  });

  test('wraps writeContract failure into RPCError', async () => {
    const { bond } = makeBond({ write: new Error('rpc down') });
    await expect(bond.stake(100n)).rejects.toBeInstanceOf(RPCError);
  });
});

describe('BondClient.requestUnstake', () => {
  test('rejects zero amount', async () => {
    const { bond } = makeBond({ reads: { stakeOf: 1_000n } });
    await expect(bond.requestUnstake(0n)).rejects.toBeInstanceOf(
      ConfigInvalidError,
    );
  });

  test('rejects amount > activeStake (preflight)', async () => {
    const { bond } = makeBond({ reads: { stakeOf: 100n } });
    await expect(bond.requestUnstake(200n)).rejects.toBeInstanceOf(
      InsufficientLiquidityError,
    );
  });

  test('happy path calls writeContract with (filler, amount)', async () => {
    const { bond, writeContract } = makeBond({
      reads: { stakeOf: 5_000n },
    });
    const tx = await bond.requestUnstake(1_000n);
    expect(tx).toBe('0xtxhash');
    expect(writeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: 'requestUnstake',
        args: [FILLER_CONTRACT, 1_000n],
      }),
    );
  });
});

describe('BondClient.withdraw', () => {
  test('rejects when there is no pending unstake', async () => {
    const { bond } = makeBond({
      reads: { pendingWithdrawalAvailableAt: UINT256_MAX },
    });
    await expect(bond.withdraw()).rejects.toBeInstanceOf(IntentExpiredError);
  });

  test('rejects when cooldown has not elapsed', async () => {
    const farFuture = BigInt(Math.floor(Date.now() / 1000)) + 60n * 60n; // +1h
    const { bond } = makeBond({
      reads: { pendingWithdrawalAvailableAt: farFuture },
    });
    await expect(bond.withdraw()).rejects.toBeInstanceOf(IntentExpiredError);
  });

  test('happy path when cooldown elapsed', async () => {
    const past = BigInt(Math.floor(Date.now() / 1000)) - 60n;
    const { bond, writeContract } = makeBond({
      reads: { pendingWithdrawalAvailableAt: past },
    });
    const tx = await bond.withdraw();
    expect(tx).toBe('0xtxhash');
    expect(writeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: 'withdraw',
        args: [FILLER_CONTRACT],
      }),
    );
  });
});

// === waitAndWithdraw ======================================================

describe('BondClient.waitAndWithdraw', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test('rejects when no pending unstake', async () => {
    const { bond } = makeBond({
      reads: { pendingWithdrawalAvailableAt: UINT256_MAX },
    });
    await expect(bond.waitAndWithdraw()).rejects.toBeInstanceOf(
      IntentExpiredError,
    );
  });

  test('withdraws immediately when cooldown already elapsed', async () => {
    const past = BigInt(Math.floor(Date.now() / 1000)) - 60n;
    const { bond, writeContract } = makeBond({
      reads: { pendingWithdrawalAvailableAt: past },
    });
    const tx = await bond.waitAndWithdraw();
    expect(tx).toBe('0xtxhash');
    expect(writeContract).toHaveBeenCalledTimes(1);
  });

  test('rejects when cooldown remaining > maxWaitMs', async () => {
    const future = BigInt(Math.floor(Date.now() / 1000)) + 7n * 24n * 60n * 60n;
    const { bond } = makeBond({
      reads: { pendingWithdrawalAvailableAt: future },
    });
    await expect(
      bond.waitAndWithdraw({ maxWaitMs: 1_000 }),
    ).rejects.toBeInstanceOf(IntentExpiredError);
  });

  test('waits for cooldown then withdraws (with fake timers)', async () => {
    const startSec = Math.floor(Date.now() / 1000);
    const endsAt = BigInt(startSec + 10); // 10 s from now
    const { bond, writeContract } = makeBond({
      reads: { pendingWithdrawalAvailableAt: endsAt },
    });
    const promise = bond.waitAndWithdraw();
    // Advance fake time past the cooldown + buffer.
    await vi.advanceTimersByTimeAsync(20_000);
    const tx = await promise;
    expect(tx).toBe('0xtxhash');
    expect(writeContract).toHaveBeenCalledTimes(1);
  });
});
