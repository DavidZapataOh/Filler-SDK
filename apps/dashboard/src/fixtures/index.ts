/**
 * Fixture registry — `?replay=<key>` URL params resolve to one of these.
 *
 * Each fixture is a frozen, deterministic timeline. Replay mode (Plan 07)
 * yields events from these tables instead of opening a real SSE connection.
 *
 * The keys here MUST match the `FixtureKey` union from `./types`.
 */

import { lvrFixture } from './lvr';
import { simpleFixture } from './simple';
import { treasuryFixture } from './treasury';
import type { Fixture, FixtureKey } from './types';

export const FIXTURES: Readonly<Record<FixtureKey, Fixture>> = {
  treasury: treasuryFixture,
  lvr: lvrFixture,
  simple: simpleFixture,
};

export function isFixtureKey(value: string): value is FixtureKey {
  return value === 'treasury' || value === 'lvr' || value === 'simple';
}

export type { Fixture, FixtureKey } from './types';
