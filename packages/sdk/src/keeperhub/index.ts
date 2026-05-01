/**
 * KeeperHubClient surface — full implementation in Plan 08.
 *
 * The KeeperHub is the off-chain coordination layer for cross-solver fill
 * routing (rotated keeper duty, deduplication, mempool dust avoidance). The
 * full HTTP/WS client lands in Plan 08 alongside the keeper protocol spec.
 *
 * Today: types only.
 */

import type { Address } from 'viem';

import type { ChainId } from '../chains';

export interface KeeperHubClientConfig {
  /** Base URL of the KeeperHub deployment (no trailing slash). */
  baseUrl: string;
  /** Solver identity. */
  account: Address;
  /** Chain id the solver is registered for. */
  chainId: ChainId;
  /** Bearer token for authenticated endpoints. */
  authToken?: string;
}

/**
 * Minimum surface expected of any KeeperHub adapter. Real impl + mock land
 * in Plan 08.
 */
export interface KeeperHubClient {
  readonly chainId: ChainId;
  readonly account: Address;
  /** Register this solver with the hub. */
  register(): Promise<void>;
  /** Heartbeat — tells the hub we're still online. */
  heartbeat(): Promise<void>;
  /** Subscribe to fill assignments. Returns an unsubscribe fn. */
  subscribeAssignments(onAssign: (assignment: unknown) => void): () => void;
}

/**
 * @internal
 */
export const __KEEPERHUB_PLACEHOLDER = Symbol.for(
  '@filler-sdk/sdk:keeperhub:v0',
);
