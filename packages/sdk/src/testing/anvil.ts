/**
 * Anvil helpers — spawn a local Anvil instance for fork tests.
 *
 * **Node-only.** Uses `node:child_process.spawn`. Will not work in browsers,
 * Cloudflare Workers, or Deno without `--allow-run`. The `/testing` entry
 * marks this fact in JSDoc; consumers running in non-Node environments
 * should not import these helpers.
 *
 * Lifecycle:
 *   - `startAnvil(opts)` spawns the binary, waits for the "Listening on …"
 *     stdout signal (10 s timeout), and returns a handle.
 *   - The handle's `stop()` sends SIGTERM, waits for `'exit'` with a 5 s
 *     deadline, then SIGKILLs as fallback. Idempotent.
 *
 * **CI tests are env-gated**: anvil isn't always installed on CI runners.
 * Use `isAnvilAvailable()` (synchronous best-effort check) to gate vitest
 * `it.skipIf(!isAnvilAvailable())` blocks. Local devs running `forge`-based
 * tests have anvil; we don't force it on the CI shell.
 */

import {
  type ChildProcess,
  execSync,
  spawn,
} from 'node:child_process';

import {
  type ChainContractAddresses,
  type ChainId,
  type Filler,
  type FillerLogger,
  createFillerFromPrivateKey,
} from '../index';

const DEFAULT_PORT = 8545;
const ANVIL_READY_REGEX = /listening on/i;
const ANVIL_READY_TIMEOUT_MS = 10_000;
const ANVIL_STOP_TIMEOUT_MS = 5_000;

/**
 * Anvil's well-known dev account #0 private key. Anyone reading this in
 * production should NOT use it for real funds — it's burned across every
 * Ethereum test framework.
 */
export const ANVIL_DEV_PRIVATE_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const;

/** Foundry's local-anvil chain id. */
export const ANVIL_CHAIN_ID = 31337 as const;

export interface AnvilHandle {
  /** Anvil RPC URL (e.g. `http://127.0.0.1:8545`). */
  readonly url: string;
  /** Resolved port. */
  readonly port: number;
  /** Underlying `ChildProcess`. Useful for advanced lifecycle (rare). */
  readonly process: ChildProcess;
  /** SIGTERM + (after 5s) SIGKILL. Idempotent. */
  stop(): Promise<void>;
}

export interface StartAnvilOptions {
  /** TCP port. Default 8545. */
  port?: number;
  /** Fork URL. When set, Anvil starts as `--fork-url <url>`. */
  forkUrl?: string;
  /** Fork-block override. Useful for deterministic state. */
  forkBlockNumber?: bigint;
  /** Auto-mine block time in seconds. Default: instant mining. */
  blockTime?: number;
  /** Number of dev accounts. Default 10. */
  accounts?: number;
  /** Initial ETH balance per dev account, in ETH (whole units). Default 10000. */
  balance?: number;
  /** Mute stdout (still listened to for the ready signal). Default true. */
  silent?: boolean;
}

/** Synchronous best-effort check: is `anvil` on PATH? */
export function isAnvilAvailable(): boolean {
  try {
    execSync('command -v anvil', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Spawn anvil + wait for ready. Returns a handle whose `.stop()` cleans up.
 *
 * @throws if `anvil` isn't on PATH or doesn't reach ready within 10s.
 */
export function startAnvil(opts: StartAnvilOptions = {}): Promise<AnvilHandle> {
  if (!isAnvilAvailable()) {
    return Promise.reject(
      new Error(
        "startAnvil: 'anvil' binary not found on PATH. Install Foundry first: `curl -L https://foundry.paradigm.xyz | bash` then `foundryup`.",
      ),
    );
  }
  const port = opts.port ?? DEFAULT_PORT;
  const args = [
    '--port',
    String(port),
    '--accounts',
    String(opts.accounts ?? 10),
    '--balance',
    String(opts.balance ?? 10_000),
    '--auto-impersonate',
  ];
  if (opts.forkUrl !== undefined) {
    args.push('--fork-url', opts.forkUrl);
    if (opts.forkBlockNumber !== undefined) {
      args.push('--fork-block-number', opts.forkBlockNumber.toString());
    }
  }
  if (opts.blockTime !== undefined) {
    args.push('--block-time', String(opts.blockTime));
  }

  const proc = spawn('anvil', args, { stdio: 'pipe' });
  const silent = opts.silent ?? true;

  return new Promise<AnvilHandle>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanupListeners();
      proc.kill('SIGKILL');
      reject(
        new Error(
          `startAnvil: didn't reach ready signal within ${ANVIL_READY_TIMEOUT_MS}ms`,
        ),
      );
    }, ANVIL_READY_TIMEOUT_MS);

    const onStdout = (data: Buffer): void => {
      const chunk = data.toString();
      if (!silent) process.stdout.write(chunk);
      if (ANVIL_READY_REGEX.test(chunk)) {
        cleanupListeners();
        clearTimeout(timer);
        resolve({
          url: `http://127.0.0.1:${port}`,
          port,
          process: proc,
          stop: () => stopAnvil(proc),
        });
      }
    };

    const onStderr = (data: Buffer): void => {
      if (!silent) process.stderr.write(data);
    };

    const onError = (err: Error): void => {
      cleanupListeners();
      clearTimeout(timer);
      reject(err);
    };

    const onExit = (code: number | null): void => {
      cleanupListeners();
      clearTimeout(timer);
      reject(
        new Error(
          `startAnvil: anvil exited with code ${code ?? 'null'} before ready signal`,
        ),
      );
    };

    function cleanupListeners(): void {
      proc.stdout?.off('data', onStdout);
      proc.stderr?.off('data', onStderr);
      proc.off('error', onError);
      proc.off('exit', onExit);
    }

    proc.stdout?.on('data', onStdout);
    proc.stderr?.on('data', onStderr);
    proc.on('error', onError);
    proc.on('exit', onExit);
  });
}

/**
 * Stop a running anvil. Sends SIGTERM, waits for `'exit'` (5s budget), then
 * SIGKILLs as fallback. Idempotent — safe to call multiple times.
 */
export function stopAnvil(proc: ChildProcess): Promise<void> {
  if (proc.exitCode !== null || proc.signalCode !== null) {
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    const onExit = (): void => {
      clearTimeout(killTimer);
      resolve();
    };
    proc.once('exit', onExit);
    proc.kill('SIGTERM');
    const killTimer = setTimeout(() => {
      if (proc.exitCode === null && proc.signalCode === null) {
        proc.kill('SIGKILL');
        // give the OS a tick to deliver the kill before we resolve.
        setTimeout(() => resolve(), 100);
      } else {
        resolve();
      }
    }, ANVIL_STOP_TIMEOUT_MS);
  });
}

// === createAnvilFiller ===================================================

export interface CreateAnvilFillerOptions {
  /** Override addresses. Without these, the Filler points at PLACEHOLDER addresses. */
  addresses?: Partial<ChainContractAddresses>;
  /** Custom chain id. Default ANVIL_CHAIN_ID (31337). */
  chainId?: ChainId;
  /** Custom logger — default uses SDK's silent default. */
  logger?: FillerLogger;
  /** Anvil dev account index (0-9). Default 0. */
  accountIndex?: number;
  /** Optional indexer config. Default: localhost. */
  indexerBaseUrl?: string;
}

/**
 * Build a `Filler` whose viem transports point at the supplied Anvil. Uses
 * the `createFillerFromPrivateKey` factory + Anvil's well-known dev keys.
 *
 * **Important**: this Filler doesn't deploy the Filler.sol / FillerBond.sol
 * contracts to the anvil instance. The caller is responsible for deploying
 * (typically via a `forge script` invocation in the test setup) and passing
 * the resolved addresses via `opts.addresses`. Without addresses, the Filler
 * points at placeholder `0x000…dEaD` addresses and any chain call reverts.
 */
export function createAnvilFiller(
  anvil: AnvilHandle,
  opts: CreateAnvilFillerOptions = {},
): Filler {
  // Anvil's well-known dev keys — only #0 is exported here. If you need a
  // different account, set ANVIL_DEV_PRIVATE_KEY-equivalents via a custom
  // `createFiller(...)` call.
  if (opts.accountIndex !== undefined && opts.accountIndex !== 0) {
    throw new Error(
      'createAnvilFiller: accountIndex !== 0 not implemented. Use the lower-level createFillerFromPrivateKey + your own anvil dev key for now.',
    );
  }

  const cfg: Parameters<typeof createFillerFromPrivateKey>[0] = {
    chainId: (opts.chainId ?? ANVIL_CHAIN_ID) as ChainId,
    privateKey: ANVIL_DEV_PRIVATE_KEY,
    rpcUrl: anvil.url,
  };
  if (opts.addresses !== undefined) {
    cfg.addresses = opts.addresses;
  }
  if (opts.logger !== undefined) {
    cfg.logger = opts.logger;
  }
  if (opts.indexerBaseUrl !== undefined) {
    cfg.indexer = { baseUrl: opts.indexerBaseUrl };
  }
  return createFillerFromPrivateKey(cfg);
}
