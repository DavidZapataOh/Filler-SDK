/**
 * One-time bond setup — production mode only. In `DEMO_MODE=true` the
 * solver doesn't broadcast, so no bond is needed. Run AFTER `bun install`
 * + `.env` and BEFORE `bun start` (production):
 *
 *   bun stake                       # default 0.1 ETH
 *   bun stake 1000000000000000000   # 1 ETH (in wei)
 */

import { createDefaultLogger, createFillerFromPrivateKey } from '@filler-sdk/sdk';

import { loadConfig } from './config';
import { loadTreasuryConfig } from './treasury';

const DEFAULT_STAKE_WEI = 100_000_000_000_000_000n; // 0.1 ETH

const config = loadConfig();
const treasury = loadTreasuryConfig();
const log = createDefaultLogger({
  level: config.LOG_LEVEL,
  bindings: { project: '{{projectName}}', script: 'stake' },
});

if (treasury.DEMO_MODE) {
  log.warn(
    {},
    '[{{projectName}}] DEMO_MODE=true — staking is a no-op in demo mode. Set DEMO_MODE=false to stake on-chain.',
  );
  process.exit(0);
}

const stakeAmountWei = parseStakeArg(process.argv[2]);

const filler = createFillerFromPrivateKey({
  chainId: config.CHAIN_ID as Parameters<typeof createFillerFromPrivateKey>[0]['chainId'],
  privateKey: config.SOLVER_PRIVATE_KEY as `0x${string}`,
  rpcUrl: config.RPC_URL,
  addresses: {
    filler: config.FILLER_ADDRESS as `0x${string}`,
    fillerBond: config.BOND_ADDRESS as `0x${string}`,
    reactor: config.REACTOR_ADDRESS as `0x${string}`,
    poolManager: config.POOL_MANAGER_ADDRESS as `0x${string}`,
  },
  logger: log,
});

log.info(
  { account: filler.account, amountWei: stakeAmountWei.toString() },
  '[{{projectName}}] submitting stake',
);

try {
  const txHash = await filler.bond.stake(stakeAmountWei);
  log.info({ txHash }, '✓ stake tx submitted');
} catch (err) {
  log.error({ err: err instanceof Error ? err.message : String(err) }, '✗ stake failed');
  await filler.shutdown();
  process.exit(1);
}

await filler.shutdown();
process.exit(0);

function parseStakeArg(arg: string | undefined): bigint {
  if (arg === undefined || arg === '') return DEFAULT_STAKE_WEI;
  try {
    const value = BigInt(arg);
    if (value <= 0n) throw new Error('must be > 0');
    return value;
  } catch (err) {
    console.error(
      `[{{projectName}}] invalid stake amount "${arg}". Pass a positive integer wei value.`,
    );
    console.error(`Reason: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(2);
  }
}
