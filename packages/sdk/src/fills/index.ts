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

export { applyGasMultiplier, FillEngine, type FillEngineConfig } from './engine';
export {
  FILL_PARAMS_ARRAY_ABI,
  decodeCallbackData,
  encodeCallbackData,
} from './encoding';
export { calibrateTickRange, type CalibratedRange, type CalibrateInput } from './tickCalibration';
export { extractRevertReason, simulateFill } from './simulation';
