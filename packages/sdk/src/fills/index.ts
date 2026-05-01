/**
 * Fill engine surface — full implementation in Plans 04 + 05.
 *
 * Today: re-exports public types. The `FillEngine` class (simulate → sign →
 * broadcast → settle) lands in Plan 04; tick calibration (`calibrateTickRange`)
 * in Plan 05.
 */

export type {
  FillParams,
  FillResult,
  FillSurface,
  SimulationResult,
} from '../types';

export { FillEngine, type FillEngineConfig } from './engine';
