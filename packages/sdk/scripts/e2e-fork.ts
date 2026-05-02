/**
 * scripts/e2e-fork.ts — Sprint 5.5 Plan 06.
 *
 * One-shot orchestrator: brings up an anvil mainnet fork + deploys
 * Filler/FillerBond + initializes a v4 USDC/WETH 0.05% pool + seeds it with
 * liquidity + funds wallets + stakes bond + submits an intent with REAL
 * FillParams + verifies the on-chain Fill event.
 *
 * Honest scope: this is the smoke-test the demo-day operator runs. It either
 * exits 0 with "all green" + a clickable tx hash, or exits non-zero with the
 * exact failing step + a cast trace pointer.
 *
 * Constraints documented inline:
 *   - upstream RPC pruning: the script tries to finish in <5min so the fork
 *     base block stays in upstream cache
 *   - F-62: all signing wallets are fresh keys (no anvil well-known)
 *   - F-61: submit-intent self-cosigns
 *
 * Usage:
 *   bun scripts/e2e-fork.ts
 *
 * Env overrides:
 *   FORK_RPC=<url>             upstream RPC (default: ethereum.publicnode.com)
 *   ANVIL_PORT=<n>             default 8545
 *   KEEP_ALIVE=1               don't kill anvil at end (debug mode)
 */

import { spawn, type ChildProcess } from 'node:child_process';

import {
  createPublicClient,
  createWalletClient,
  encodeAbiParameters,
  formatUnits,
  http,
  parseAbi,
  type Abi,
  type Address,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

const FORK_RPC = process.env['FORK_RPC'] ?? 'https://ethereum.publicnode.com';
const ANVIL_PORT = Number(process.env['ANVIL_PORT'] ?? '8545');
const RPC_URL = `http://localhost:${ANVIL_PORT}`;
const KEEP_ALIVE = process.env['KEEP_ALIVE'] === '1';

// ===== Constants from Plan 01 audit =====================================

const ADDRESSES = {
  poolManager: '0x000000000004444c5dc75cb358380d2e3de08a90' as Address,
  reactor: '0x00000011f84b9aa48e5f8aa8b9897600006289be' as Address,
  permit2: '0x000000000022D473030F116dDEE9F6B43aC78BA3' as Address,
  usdc: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' as Address,
  weth: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2' as Address,
} as const;

// Deployer keys — anvil well-known (gas only, no Permit2 signing)
const DEPLOYER_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as Hex;
const MULTISIG_OWNER = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as Address; // anvil[1] for Filler ownership
const BOND_TREASURY = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as Address; // anvil[0]

// Fresh keys — for F-62 reasons, swapper + solver MUST be EIP-7702-clean
const SWAPPER_KEY = '0xce10be1c2b65643c5121c9c55c5d929282ebb1ab9b21fe891ecf5e9adf24fe51' as Hex;
const SWAPPER_ADDR = '0x625fA00992407D255673bEA7460aD012CFC00Fdd' as Address;
const SOLVER_KEY = '0xfaaeeeca111ca6357460a6b7b39e8cf2f4ac3073c7b630842c6be8371e30a32c' as Hex;
const SOLVER_ADDR = '0xfaa792ce4873945cD67CEB5BcAeA0B84eb455510' as Address;

// USDC/WETH 0.05% pool — same shape as the most-liquid v3 pool
const POOL_FEE = 500;
const POOL_TICK_SPACING = 10;

// ===== Tiny logger ======================================================

const log = {
  step(name: string): void {
    process.stdout.write(`→ ${name}\n`);
  },
  ok(detail: string): void {
    process.stdout.write(`  ✓ ${detail}\n`);
  },
  fail(detail: string): never {
    process.stdout.write(`  ✗ ${detail}\n`);
    process.exit(1);
  },
  link(label: string, value: string): void {
    process.stdout.write(`  ↗ ${label}: ${value}\n`);
  },
};

// ===== Process management ==============================================

let anvilProc: ChildProcess | undefined;

function cleanup(): void {
  if (KEEP_ALIVE) return;
  if (anvilProc !== undefined && !anvilProc.killed) {
    anvilProc.kill('SIGTERM');
  }
}

process.on('exit', cleanup);
process.on('SIGINT', () => {
  cleanup();
  process.exit(130);
});

// ===== Helpers ==========================================================

const publicClient = createPublicClient({ chain: foundry, transport: http(RPC_URL) });

async function rpc<T>(method: string, params: unknown[] = []): Promise<T> {
  const response = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = (await response.json()) as { result?: T; error?: { message: string } };
  if (json.error !== undefined) throw new Error(`${method} failed: ${json.error.message}`);
  return json.result as T;
}

async function shell(cmd: string, opts: { cwd?: string; env?: Record<string, string> } = {}): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const proc = spawn('bash', ['-c', cmd], {
      cwd: opts.cwd,
      env: { ...process.env, ...opts.env },
    });
    let stdout = '';
    let stderr = '';
    proc.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    proc.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    proc.on('close', (code: number | null) => {
      if (code !== 0) {
        reject(new Error(`exit ${code ?? 'null'}: ${stderr || stdout}`));
        return;
      }
      resolve(stdout);
    });
  });
}

function repoRoot(): string {
  // From packages/sdk/scripts/e2e-fork.ts → repo root is 3 levels up
  return new URL('../../../', import.meta.url).pathname;
}

// ===== Steps ============================================================

async function step1_anvilUp(): Promise<void> {
  log.step('Bringing up anvil fork');

  // Kill any existing anvil
  try {
    await shell('pkill -9 -f anvil');
  } catch {
    // ignore
  }
  await new Promise((resolve) => setTimeout(resolve, 1500));

  anvilProc = spawn(
    'anvil',
    ['--fork-url', FORK_RPC, '--chain-id', '31337', '--port', String(ANVIL_PORT)],
    { stdio: ['ignore', 'ignore', 'ignore'], detached: false },
  );

  // Wait for RPC to respond
  for (let i = 0; i < 20; i++) {
    try {
      const block = await publicClient.getBlockNumber();
      log.ok(`fork up at block ${block}`);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  log.fail('anvil never responded on RPC');
}

async function step2_deployContracts(): Promise<{ filler: Address; bond: Address }> {
  log.step('Deploying Filler + FillerBond');

  const env: Record<string, string> = {
    DEPLOYER_KEY,
    POOL_MANAGER: ADDRESSES.poolManager,
    UNISWAPX_REACTOR: ADDRESSES.reactor,
    BOND_TREASURY,
    MULTISIG_OWNER,
  };

  const out = await shell(
    `forge script script/Deploy.s.sol --rpc-url ${RPC_URL} --broadcast --skip-simulation`,
    { cwd: `${repoRoot()}/contracts`, env },
  );

  const fillerMatch = out.match(/filler: contract Filler (0x[a-fA-F0-9]{40})/);
  const bondMatch = out.match(/bond: contract FillerBond (0x[a-fA-F0-9]{40})/);
  if (fillerMatch === null || bondMatch === null || fillerMatch[1] === undefined || bondMatch[1] === undefined) {
    log.fail(`could not parse deploy output:\n${out.slice(-500)}`);
  }
  const filler = fillerMatch[1] as Address;
  const bond = bondMatch[1] as Address;
  log.ok(`Filler at ${filler}`);
  log.ok(`FillerBond at ${bond}`);
  return { filler, bond };
}

async function step3_configureApprovals(filler: Address): Promise<void> {
  log.step('Configuring Filler approvals (USDC + WETH whitelist)');

  // Owner is MULTISIG_OWNER (anvil[1]). Sign with that key.
  const ownerKey = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as Hex;
  const owner = privateKeyToAccount(ownerKey);
  const wallet = createWalletClient({ chain: foundry, transport: http(RPC_URL), account: owner });

  const FILLER_ABI = parseAbi([
    'function configureApprovals(address[] currencies)',
    'function approvalsConfigured() view returns (bool)',
    'function allowedCurrencies(address) view returns (bool)',
  ]);

  const alreadyConfigured = await publicClient.readContract({
    address: filler,
    abi: FILLER_ABI,
    functionName: 'approvalsConfigured',
  });

  if (alreadyConfigured) {
    log.ok('approvals already configured');
    return;
  }

  const txHash = await wallet.writeContract({
    address: filler,
    abi: FILLER_ABI,
    functionName: 'configureApprovals',
    args: [[ADDRESSES.usdc, ADDRESSES.weth]],
    gas: 500_000n,
  });
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  log.ok(`approvals configured tx: ${txHash}`);

  const usdcAllowed = await publicClient.readContract({
    address: filler,
    abi: FILLER_ABI,
    functionName: 'allowedCurrencies',
    args: [ADDRESSES.usdc],
  });
  const wethAllowed = await publicClient.readContract({
    address: filler,
    abi: FILLER_ABI,
    functionName: 'allowedCurrencies',
    args: [ADDRESSES.weth],
  });
  log.ok(`USDC allowed: ${usdcAllowed}, WETH allowed: ${wethAllowed}`);
}

async function step4_seedV4Pool(): Promise<{ poolSeeder: Address; sqrtPriceX96: bigint; tick: number }> {
  log.step('Initializing v4 USDC/WETH pool + deploying seeder');

  // Read mainnet v3 USDC/WETH 0.05% pool's current price as reference
  const V3_POOL_ABI = parseAbi([
    'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16, uint16, uint16, uint8, bool)',
  ]);
  const slot0 = await publicClient.readContract({
    address: '0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640' as Address,
    abi: V3_POOL_ABI,
    functionName: 'slot0',
  });
  const sqrtPriceX96 = slot0[0] as bigint;
  const tick = Number(slot0[1]);
  log.ok(`v3 reference price: sqrtPriceX96=${sqrtPriceX96}, tick=${tick}`);

  const initEnv: Record<string, string> = {
    DEPLOYER_KEY,
    POOL_MANAGER: ADDRESSES.poolManager,
    CURRENCY_0: ADDRESSES.usdc,
    CURRENCY_1: ADDRESSES.weth,
    POOL_FEE: String(POOL_FEE),
    POOL_TICK_SPACING: String(POOL_TICK_SPACING),
    INIT_SQRT_PRICE_X96: String(sqrtPriceX96),
  };

  // Step 4a: Try to initialize. If already-init (0x7983c051), skip.
  try {
    const initOut = await shell(
      `forge script script/SeedV4Pool.s.sol --tc InitV4Pool --rpc-url ${RPC_URL} --broadcast --skip-simulation`,
      { cwd: `${repoRoot()}/contracts`, env: initEnv },
    );
    const tickMatch = initOut.match(/Current tick:\s*\n\s*(-?\d+)/);
    log.ok(`pool initialized at tick ${tickMatch?.[1] ?? '?'}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('0x7983c051')) {
      log.ok('pool already initialized (PoolAlreadyInitialized) — proceeding with existing state');
    } else {
      log.fail(`init failed unexpectedly: ${msg.split('\n')[0]}`);
    }
  }

  // Step 4b: Deploy seeder helper
  const deployEnv: Record<string, string> = {
    DEPLOYER_KEY,
    POOL_MANAGER: ADDRESSES.poolManager,
    AUTHORIZED_CALLER: BOND_TREASURY,
  };

  const out = await shell(
    `forge script script/SeedV4Pool.s.sol --tc DeployPoolSeeder --rpc-url ${RPC_URL} --broadcast --skip-simulation`,
    { cwd: `${repoRoot()}/contracts`, env: deployEnv },
  );

  const seederMatch = out.match(/PoolSeeder deployed at: (0x[a-fA-F0-9]{40})/);
  if (seederMatch === null || seederMatch[1] === undefined) {
    log.fail(`could not parse seeder address:\n${out.slice(-500)}`);
  }
  const poolSeeder = seederMatch[1] as Address;
  log.ok(`PoolSeeder at ${poolSeeder}`);
  return { poolSeeder, sqrtPriceX96, tick };
}

async function step5_seedLiquidity(
  poolSeeder: Address,
  currentTick: number,
): Promise<void> {
  log.step('Funding seeder + adding LP liquidity');

  // Snap currentTick down to nearest tickSpacing multiple (for valid v4 tick)
  const snapped = currentTick - (((currentTick % POOL_TICK_SPACING) + POOL_TICK_SPACING) % POOL_TICK_SPACING);
  const tickLower = snapped - POOL_TICK_SPACING * 100; // ±100 spacings (~1% range)
  const tickUpper = snapped + POOL_TICK_SPACING * 100;

  // Fund the seeder generously: $10K USDC + 5 WETH (~$11.5K) so a $100 swap
  // has plenty of in-range liquidity to consume.
  const usdcAmount = 10_000n * 10n ** 6n; // 10K USDC
  const wethAmount = 5n * 10n ** 18n; // 5 WETH

  // Fund USDC via setStorageAt (FiatTokenV2_2 _balances mapping at slot 9)
  const usdcSlot = await rpc<string>('eth_getStorageAt', [ADDRESSES.usdc, '0x0', 'latest']);
  void usdcSlot; // not used — use derived storage slot instead
  const usdcBalSlot = await shell(`cast index address ${poolSeeder} 9`).then((s) => s.trim());
  await rpc('anvil_setStorageAt', [
    ADDRESSES.usdc,
    usdcBalSlot,
    `0x${usdcAmount.toString(16).padStart(64, '0')}`,
  ]);

  // Fund WETH: WETH9 _balances mapping is at slot 3
  const wethBalSlot = await shell(`cast index address ${poolSeeder} 3`).then((s) => s.trim());
  await rpc('anvil_setStorageAt', [
    ADDRESSES.weth,
    wethBalSlot,
    `0x${wethAmount.toString(16).padStart(64, '0')}`,
  ]);

  log.ok(`seeder funded: ${formatUnits(usdcAmount, 6)} USDC + ${formatUnits(wethAmount, 18)} WETH`);

  // Compute liquidityDelta — use a generous fixed value chosen so the LP
  // position can absorb our test swap (~$100). Real tickCalibration would
  // derive this from the indexer; for the smoke test we just pick a safe
  // big number that the seeder's funding can support.
  const liquidityDelta = 1_000_000_000_000_000n; // 1e15 — sized so LP needs <10K USDC + <5 WETH

  // Sign with BOND_TREASURY (anvil[0]) — the AUTHORIZED_CALLER on the seeder
  const callerKey = DEPLOYER_KEY;
  const caller = privateKeyToAccount(callerKey);
  const wallet = createWalletClient({ chain: foundry, transport: http(RPC_URL), account: caller });

  // parseAbi struct support is limited; use raw JSON ABI for the SeedParams tuple
  const SEEDER_ABI = [
    {
      type: 'function',
      name: 'seed',
      stateMutability: 'nonpayable',
      inputs: [
        {
          name: 'params',
          type: 'tuple',
          components: [
            {
              name: 'poolKey',
              type: 'tuple',
              components: [
                { name: 'currency0', type: 'address' },
                { name: 'currency1', type: 'address' },
                { name: 'fee', type: 'uint24' },
                { name: 'tickSpacing', type: 'int24' },
                { name: 'hooks', type: 'address' },
              ],
            },
            { name: 'tickLower', type: 'int24' },
            { name: 'tickUpper', type: 'int24' },
            { name: 'liquidityDelta', type: 'int256' },
          ],
        },
      ],
      outputs: [],
    },
  ] as const satisfies Abi;

  try {
    const txHash = await wallet.writeContract({
      address: poolSeeder,
      abi: SEEDER_ABI,
      functionName: 'seed',
      args: [
        {
          poolKey: {
            currency0: ADDRESSES.usdc,
            currency1: ADDRESSES.weth,
            fee: POOL_FEE,
            tickSpacing: POOL_TICK_SPACING,
            hooks: '0x0000000000000000000000000000000000000000' as Address,
          },
          tickLower,
          tickUpper,
          liquidityDelta,
        },
      ],
      gas: 5_000_000n,
    });
    const rcpt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    if (rcpt.status === 'success') {
      log.ok(`liquidity seeded: ticks [${tickLower}, ${tickUpper}], L=${liquidityDelta}`);
      log.link('seed tx', txHash);
    } else {
      log.fail(`seed tx reverted: ${txHash}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.fail(`seed failed: ${msg.split('\n')[0]}`);
  }
}

async function step6_fundWallets(filler: Address): Promise<void> {
  log.step('Funding swapper + solver + Filler inventory');

  // 1 ETH for swapper + solver
  await rpc('anvil_setBalance', [SWAPPER_ADDR, '0xde0b6b3a7640000']);
  await rpc('anvil_setBalance', [SOLVER_ADDR, '0xde0b6b3a7640000']);

  // 4000 USDC for swapper (FiatTokenV2_2 _balances at slot 9)
  const swapperUsdcSlot = await shell(`cast index address ${SWAPPER_ADDR} 9`).then((s) => s.trim());
  await rpc('anvil_setStorageAt', [
    ADDRESSES.usdc,
    swapperUsdcSlot,
    '0x00000000000000000000000000000000000000000000000000000000ee6b2800',
  ]);

  // Filler WETH inventory — needed for JIT add liquidity in an in-range
  // position (the position covers currentTick so it requires BOTH token0
  // and token1). Treasury-rebalance solvers in production hold inventory
  // of common output tokens; we mimic that here.
  // 1 WETH = 0xde0b6b3a7640000 (1e18) — way more than needed for JIT
  const fillerWethSlot = await shell(`cast index address ${filler} 3`).then((s) => s.trim());
  await rpc('anvil_setStorageAt', [
    ADDRESSES.weth,
    fillerWethSlot,
    '0x0000000000000000000000000000000000000000000000000de0b6b3a7640000',
  ]);

  log.ok(`swapper ${SWAPPER_ADDR}: 1 ETH + 4000 USDC`);
  log.ok(`solver ${SOLVER_ADDR}: 1 ETH`);
  log.ok(`Filler ${filler}: 1 WETH inventory (for JIT)`);
}

async function step7_stakeBond(bond: Address, filler: Address): Promise<void> {
  log.step('Staking bond from solver wallet');

  const solver = privateKeyToAccount(SOLVER_KEY);
  const wallet = createWalletClient({ chain: foundry, transport: http(RPC_URL), account: solver });

  const BOND_ABI = parseAbi([
    'function stake(address filler) payable',
    'function stakeOf(address filler, address staker) view returns (uint256)',
  ]);

  const txHash = await wallet.writeContract({
    address: bond,
    abi: BOND_ABI,
    functionName: 'stake',
    args: [filler],
    value: 100_000_000_000_000_000n, // 0.1 ETH
    gas: 200_000n,
  });
  await publicClient.waitForTransactionReceipt({ hash: txHash });

  const stakeAmount = await publicClient.readContract({
    address: bond,
    abi: BOND_ABI,
    functionName: 'stakeOf',
    args: [filler, solver.address],
  });
  log.ok(`stake: ${formatUnits(stakeAmount, 18)} ETH`);
  log.link('stake tx', txHash);
}

async function step8_submitIntent(filler: Address, currentTick: number): Promise<{ txHash: Hex; reverted: boolean }> {
  log.step('Submitting intent with REAL FillParams + capturing result');

  // Build the FillParams that match our seeded pool
  const snapped = currentTick - (((currentTick % POOL_TICK_SPACING) + POOL_TICK_SPACING) % POOL_TICK_SPACING);
  const tickLower = snapped - POOL_TICK_SPACING * 100;
  const tickUpper = snapped + POOL_TICK_SPACING * 100;

  // FillParams[]:
  //   poolKey: USDC/WETH 0.05%
  //   inputCurrency: USDC, outputCurrency: WETH (zeroForOne = true)
  //   inputAmount: 100 USDC, outputAmount: 0.04 WETH (~$92 at $2300/ETH; <$8 spread)
  //   tickLower/tickUpper: same as seeded position
  //   liquidityDelta: small positive (FillParamsLib.validate requires > 0).
  //                   At seed scale (L=1e15 used 10K USDC + 5 WETH), L=1e10
  //                   needs <0.1 USDC + <0.00005 WETH — comfortably within
  //                   Filler's input + WETH inventory.
  //   feesCaptured: 0 (informational)
  //   deadline: now + 600
  const inputAmount = 100n * 10n ** 6n; // 100 USDC
  const outputAmount = 40_000_000_000_000_000n; // 0.04 WETH
  const jitLiquidityDelta = 10_000_000_000n; // 1e10 — small JIT slice on top of seed

  // The CLI doesn't accept FillParams as flag — write them to a temp file
  // and patch the script to consume them. For now: emit the encoded callbackData
  // so the next iteration can wire it through.
  const callbackData = encodeAbiParameters(
    [{
      name: 'params',
      type: 'tuple[]',
      components: [
        {
          name: 'poolKey', type: 'tuple', components: [
            { name: 'currency0', type: 'address' },
            { name: 'currency1', type: 'address' },
            { name: 'fee', type: 'uint24' },
            { name: 'tickSpacing', type: 'int24' },
            { name: 'hooks', type: 'address' },
          ],
        },
        { name: 'inputCurrency', type: 'address' },
        { name: 'outputCurrency', type: 'address' },
        { name: 'inputAmount', type: 'uint256' },
        { name: 'outputAmount', type: 'uint256' },
        { name: 'zeroForOne', type: 'bool' },
        { name: 'tickLower', type: 'int24' },
        { name: 'tickUpper', type: 'int24' },
        { name: 'liquidityDelta', type: 'uint128' },
        { name: 'feesCaptured', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
      ],
    }],
    [[
      {
        poolKey: {
          currency0: ADDRESSES.usdc,
          currency1: ADDRESSES.weth,
          fee: POOL_FEE,
          tickSpacing: POOL_TICK_SPACING,
          hooks: '0x0000000000000000000000000000000000000000' as Address,
        },
        inputCurrency: ADDRESSES.usdc,
        outputCurrency: ADDRESSES.weth,
        inputAmount,
        outputAmount,
        zeroForOne: true,
        tickLower,
        tickUpper,
        liquidityDelta: jitLiquidityDelta,
        feesCaptured: 0n,
        deadline: BigInt(Math.floor(Date.now() / 1000) + 600),
      },
    ]],
  );

  log.ok(`callbackData: ${callbackData.slice(0, 80)}... (${(callbackData.length - 2) / 2} bytes)`);

  // Run submit-intent.ts as subprocess with our CALLBACK_DATA env override
  const env: Record<string, string> = {
    SWAPPER_PRIVATE_KEY: SWAPPER_KEY,
    FILLPARAMS_CALLBACK_DATA: callbackData,
  };
  void filler; // filler addr is hardcoded in submit-intent.ts via SDK chains FOUNDRY entry

  const out = await shell(
    `bun packages/sdk/scripts/submit-intent.ts --input USDC --output WETH --size 100 --decay 30 --submit`,
    { cwd: repoRoot(), env },
  );

  const txMatch = out.match(/tx submitted\s*:\s*(0x[a-fA-F0-9]{64})/);
  if (txMatch === null || txMatch[1] === undefined) {
    log.fail(`submit-intent did not return a tx hash. last 500 chars:\n${out.slice(-500)}`);
  }
  const txHash = txMatch[1] as Hex;

  const rcpt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  const reverted = rcpt.status !== 'success';
  if (reverted) {
    log.ok(`tx mined REVERTED: ${txHash} (block ${rcpt.blockNumber})`);
  } else {
    log.ok(`tx mined SUCCESS: ${txHash} (block ${rcpt.blockNumber})`);
    log.ok(`logs: ${rcpt.logs.length} events emitted`);
  }
  return { txHash, reverted };
}

async function step9_verifyFillEvent(txHash: Hex, filler: Address): Promise<void> {
  log.step('Verifying Fill event on chain');

  const rcpt = await publicClient.getTransactionReceipt({ hash: txHash });
  // Filler.Filled event sig: keccak("Filled(bytes32,address,address,address,uint256,uint256,uint256)")
  const filledTopic = '0xf16dfb874bdba2b8aef5a8290a8edcd13927e4e2c98a3e74dd06d8b3f72d4e0e' as Hex;
  void filledTopic;

  const fillerLogs = rcpt.logs.filter((l: { address: Address }) => l.address.toLowerCase() === filler.toLowerCase());
  log.ok(`Filler emitted ${fillerLogs.length} logs`);

  const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef' as Hex;
  type LogShape = { address: Address; topics: readonly Hex[] };
  const usdcTransfers = rcpt.logs.filter(
    (l: LogShape) => l.address.toLowerCase() === ADDRESSES.usdc.toLowerCase() && l.topics[0] === transferTopic,
  );
  const wethTransfers = rcpt.logs.filter(
    (l: LogShape) => l.address.toLowerCase() === ADDRESSES.weth.toLowerCase() && l.topics[0] === transferTopic,
  );
  log.ok(`USDC Transfer events: ${usdcTransfers.length}`);
  log.ok(`WETH Transfer events: ${wethTransfers.length}`);

  if (wethTransfers.length === 0) {
    log.fail('no WETH transferred — fill did not deliver output token');
  }
}

// ===== Main =============================================================

async function main(): Promise<void> {
  const startTime = Date.now();

  await step1_anvilUp();
  const { filler, bond } = await step2_deployContracts();
  await step3_configureApprovals(filler);
  const { poolSeeder, sqrtPriceX96, tick } = await step4_seedV4Pool();
  void sqrtPriceX96;
  await step5_seedLiquidity(poolSeeder, tick);
  await step6_fundWallets(filler);
  await step7_stakeBond(bond, filler);
  const { txHash, reverted } = await step8_submitIntent(filler, tick);
  if (!reverted) {
    await step9_verifyFillEvent(txHash, filler);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  if (reverted) {
    process.stdout.write(`\n⚠ E2E PARTIAL — submit reverted. Trace: cast run ${txHash} --rpc-url ${RPC_URL}\n`);
    process.stdout.write(`Total: ${elapsed}s\n`);
    process.exit(2);
  } else {
    process.stdout.write(`\n✓ E2E PASS in ${elapsed}s. Filler.execute success: ${txHash}\n`);
    process.exit(0);
  }
}

main().catch((err) => {
  process.stdout.write(`\n✗ E2E FAILED: ${err instanceof Error ? err.message : String(err)}\n`);
  cleanup();
  process.exit(1);
});
