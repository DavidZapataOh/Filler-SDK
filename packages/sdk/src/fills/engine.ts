/**
 * `FillEngine` — turns an `Intent` + a `FillParams` into a confirmed fill on
 * chain. Wraps the simulate → sign → broadcast → wait-for-receipt loop and
 * is the single place that talks to viem's wallet client.
 *
 * **Implementation status (Plan 02):** the class shape, constructor, and
 * dependency wiring are real. The actual
 *   - `prepare(intent)`  — depth lookup + tick calibration       → Plan 04+05
 *   - `simulate(intent, params)` — `eth_call` against `Filler.execute` → Plan 04
 *   - `execute(intent, params, opts)` — full broadcast loop      → Plan 04
 * implementations land in **Plan 04 + Plan 05**. Until then each method
 * rejects with `FillerError(UNKNOWN, "implemented in Plan 04")`. This keeps
 * the same loud-failure posture documented in
 * `01-package-architecture-progress.md` §5.3 — solver authors who hit the
 * runtime see a typed signal, never a silent no-op.
 */

import { FillerError } from '../errors';
import type {
  ChainContractAddresses,
  FillerLogger,
  FillParams,
  FillResult,
  FillSurface,
  Intent,
  SimulationResult,
  SubmitFillOptions,
} from '../types';
import type { IndexerClient } from '../indexer/client';
import type { KeeperHubClient } from '../keeperhub/client';

export interface FillEngineConfig {
  publicClient: unknown;
  walletClient: unknown;
  addresses: Pick<ChainContractAddresses, 'filler' | 'reactor' | 'poolManager'>;
  indexer: IndexerClient;
  keeperHub: KeeperHubClient | null;
  logger: FillerLogger;
}

export class FillEngine implements FillSurface {
  readonly #publicClient: unknown;
  readonly #walletClient: unknown;
  readonly #addresses: FillEngineConfig['addresses'];
  readonly #indexer: IndexerClient;
  readonly #keeperHub: KeeperHubClient | null;
  readonly #logger: FillerLogger;

  constructor(cfg: FillEngineConfig) {
    this.#publicClient = cfg.publicClient;
    this.#walletClient = cfg.walletClient;
    this.#addresses = cfg.addresses;
    this.#indexer = cfg.indexer;
    this.#keeperHub = cfg.keeperHub;
    this.#logger = cfg.logger.child?.({ component: 'FillEngine' }) ?? cfg.logger;
  }

  /** Filler contract address — exposed for tests + telemetry. */
  get fillerAddress(): `0x${string}` {
    return this.#addresses.filler;
  }

  /** True if KeeperHub is wired and `submitFill` will route private by default. */
  get keeperHubEnabled(): boolean {
    return this.#keeperHub !== null;
  }

  prepare(_intent: Intent): Promise<FillParams | null> {
    return Promise.reject(
      new FillerError(
        'UNKNOWN',
        'FillEngine.prepare is implemented in Plan 04 (depth lookup + Plan 05 tick calibration)',
      ),
    );
  }

  simulate(_intent: Intent, _params: FillParams): Promise<SimulationResult> {
    return Promise.reject(
      new FillerError(
        'UNKNOWN',
        'FillEngine.simulate is implemented in Plan 04 (eth_call pre-flight + revert decoding)',
      ),
    );
  }

  execute(
    _intent: Intent,
    _params: FillParams,
    _options?: SubmitFillOptions,
  ): Promise<FillResult> {
    return Promise.reject(
      new FillerError(
        'UNKNOWN',
        'FillEngine.execute is implemented in Plan 04 (simulate → sign → broadcast → receipt)',
      ),
    );
  }
}
