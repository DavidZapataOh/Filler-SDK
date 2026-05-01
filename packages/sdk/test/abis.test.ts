import { describe, expect, test } from 'vitest';

import * as abis from '../src/abis';
import { fillerAbi } from '../src/abis/filler';
import { fillerBondAbi } from '../src/abis/fillerBond';
import { poolManagerAbi } from '../src/abis/poolManager';

/**
 * The ABIs are auto-generated from `contracts/out/*.json` by
 * `scripts/gen-abis.ts`. These tests guard:
 *
 *   - The auto-gen script wired the right artifacts into the right exports.
 *   - The arrays are non-empty (catches a regenerate-after-empty-build bug).
 *   - The expected functions/events show up — drift in the contracts that
 *     removes a public method will fail here, which is the canary we want.
 */

describe('@filler-sdk/sdk/abis', () => {
  test('barrel re-exports all three ABIs', () => {
    expect(abis.fillerAbi).toBe(fillerAbi);
    expect(abis.fillerBondAbi).toBe(fillerBondAbi);
    expect(abis.poolManagerAbi).toBe(poolManagerAbi);
  });

  test('fillerAbi exposes the `execute` entrypoint expected by the reactor', () => {
    const names = fillerAbi
      .filter((item) => item.type === 'function')
      .map((item) => item.name);
    expect(names).toContain('execute');
  });

  test('fillerBondAbi exposes core bond ops', () => {
    const names = fillerBondAbi
      .filter((item) => item.type === 'function')
      .map((item) => item.name);
    expect(names).toEqual(
      expect.arrayContaining(['stake', 'requestUnstake', 'withdraw']),
    );
  });

  test('poolManagerAbi exposes the v4 lifecycle events', () => {
    const events = poolManagerAbi
      .filter((item) => item.type === 'event')
      .map((item) => item.name);
    expect(events).toEqual(
      expect.arrayContaining(['Initialize', 'ModifyLiquidity', 'Swap', 'Donate']),
    );
  });
});
