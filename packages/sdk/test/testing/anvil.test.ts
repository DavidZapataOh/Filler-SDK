import { afterAll, describe, expect, test } from 'vitest';

import {
  ANVIL_CHAIN_ID,
  ANVIL_DEV_PRIVATE_KEY,
  type AnvilHandle,
  createAnvilFiller,
  isAnvilAvailable,
  startAnvil,
} from '../../src/testing';

const ANVIL_PRESENT = isAnvilAvailable();

describe('testing/anvil — isAnvilAvailable', () => {
  test('returns boolean', () => {
    expect(typeof ANVIL_PRESENT).toBe('boolean');
  });
});

describe('testing/anvil — constants', () => {
  test('ANVIL_CHAIN_ID is 31337', () => {
    expect(ANVIL_CHAIN_ID).toBe(31_337);
  });

  test('ANVIL_DEV_PRIVATE_KEY is anvil[0]', () => {
    expect(ANVIL_DEV_PRIVATE_KEY).toBe(
      '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    );
  });
});

// Lifecycle tests are env-gated — anvil isn't always installed on CI runners.
// Run locally with `bun run vitest test/testing/anvil` to exercise them.
describe.skipIf(!ANVIL_PRESENT)('testing/anvil — lifecycle (env-gated)', () => {
  let handle: AnvilHandle | undefined;

  afterAll(async () => {
    if (handle !== undefined) await handle.stop();
  });

  test('startAnvil + stopAnvil round-trip on a fresh port', async () => {
    // Pick a high port to avoid collisions with running anvils.
    const port = 28_545 + Math.floor(Math.random() * 1_000);
    handle = await startAnvil({ port, silent: true });
    expect(handle.url).toBe(`http://127.0.0.1:${port}`);
    expect(handle.process.exitCode).toBeNull();
    await handle.stop();
    // Idempotent — second stop is a no-op.
    await handle.stop();
    handle = undefined;
  }, 30_000);

  test('createAnvilFiller wires the rpcUrl + foundry chain id', async () => {
    const port = 29_545 + Math.floor(Math.random() * 1_000);
    const h = await startAnvil({ port, silent: true });
    try {
      const filler = createAnvilFiller(h);
      expect(filler.chainId).toBe(ANVIL_CHAIN_ID);
      // anvil[0]'s well-known address.
      expect(filler.account.toLowerCase()).toBe(
        '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
      );
    } finally {
      await h.stop();
    }
  }, 30_000);
});

describe('testing/anvil — startAnvil error path', () => {
  test('rejects when anvil binary is missing', async () => {
    if (ANVIL_PRESENT) {
      // Skip; we can't simulate "missing binary" without env manipulation
      // we don't want to do mid-suite.
      return;
    }
    await expect(startAnvil({ port: 29_999, silent: true })).rejects.toThrow(
      /anvil.*not found/i,
    );
  });
});
