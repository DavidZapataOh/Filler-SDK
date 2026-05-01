/**
 * `@filler-sdk/sdk/bond` — bond client public surface.
 *
 * Imports:
 *   - `BondClient` (class, Plan 02 wires it; Plan 07 ships the on-chain impls)
 *   - `BondClientConfig` (config bag for constructing the class)
 *   - `BondClientHandle` (the structural interface — re-exported from types
 *     so users can author against it without instantiating)
 */

export { BondClient } from './client';
export type { BondClientConfig } from './client';
export type { BondClientHandle } from '../types';
