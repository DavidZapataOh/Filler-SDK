/**
 * `KeeperHubClient` — coordination + private-routing for solvers participating
 * in a KeeperHub deployment.
 *
 * **Implementation status (Plan 02):** class + config validation are real;
 * `register`, `heartbeat`, `subscribeAssignments` reject with a Plan 08
 * pointer until that plan ships the actual hub protocol.
 */

import { FillerError } from '../errors';
import type { ChainId } from '../chains';
import type { FillerLogger } from '../types';

export interface KeeperHubClientConfig {
  /** Hub base URL — must be `https://`. */
  baseUrl: string;
  /** Bearer token issued during solver onboarding. */
  apiKey: string;
  /** Solver chain id. */
  chainId: ChainId;
  /** Solver account. */
  account: `0x${string}`;
  logger: FillerLogger;
  /** Optional fetch override for tests. */
  fetch?: typeof fetch;
}

export class KeeperHubClient {
  readonly #baseUrl: string;
  readonly #apiKey: string;
  readonly #logger: FillerLogger;
  readonly #fetch: typeof fetch;
  readonly chainId: ChainId;
  readonly account: `0x${string}`;

  constructor(cfg: KeeperHubClientConfig) {
    this.#baseUrl = cfg.baseUrl.replace(/\/+$/, '');
    this.#apiKey = cfg.apiKey;
    this.#logger = cfg.logger.child?.({ component: 'KeeperHubClient' }) ?? cfg.logger;
    this.#fetch = cfg.fetch ?? globalThis.fetch;
    this.chainId = cfg.chainId;
    this.account = cfg.account;
  }

  /** Resolved base URL (no trailing slash). */
  get baseUrl(): string {
    return this.#baseUrl;
  }

  register(): Promise<void> {
    return this.#unimplemented('register');
  }

  heartbeat(): Promise<void> {
    return this.#unimplemented('heartbeat');
  }

  subscribeAssignments(_onAssign: (assignment: unknown) => void): () => void {
    throw new FillerError(
      'UNKNOWN',
      'KeeperHubClient.subscribeAssignments is implemented in Plan 08 (hub coordination protocol)',
    );
  }

  #unimplemented<T>(method: string): Promise<T> {
    return Promise.reject(
      new FillerError(
        'UNKNOWN',
        `KeeperHubClient.${method} is implemented in Plan 08`,
      ),
    );
  }
}
