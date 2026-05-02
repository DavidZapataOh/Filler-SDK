/**
 * IndexerClient surface — full implementation in Plan 06.
 *
 * Today: re-exports public types. The `IndexerClient` class (HTTP client for
 * the JIT-hints API with retries + cache + SSE) lands in Plan 06.
 */

export type {
  ChainStatus,
  DepthHint,
  DepthQuery,
  IndexerSurface,
} from '../types';

export {
  decodeDepthHint,
  IndexerClient,
  type IndexerClientConfig,
} from './client';
