import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { _resetEnvForTesting, loadEnv } from '../src/env';

describe('loadEnv', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    _resetEnvForTesting();
    // Strip every var the schema knows about so each test sees a clean baseline.
    for (const key of Object.keys(process.env)) {
      if (
        key.endsWith('_RPC_URL') ||
        key.endsWith('_WSS_URL') ||
        key.endsWith('_POOL_MANAGER') ||
        key.endsWith('_START_BLOCK')
      ) {
        delete process.env[key];
      }
    }
    delete process.env.DATABASE_URL;
    delete process.env.LOG_LEVEL;
    delete process.env.PORT;
    delete process.env.HOST;
  });

  afterEach(() => {
    _resetEnvForTesting();
    for (const k of Object.keys(process.env)) delete process.env[k];
    Object.assign(process.env, originalEnv);
  });

  test('applies safe defaults when nothing is set', () => {
    const env = loadEnv({});

    // Defaults from the schema.
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.PORT).toBe(42_069);
    expect(env.HOST).toBe('0.0.0.0');

    // Each chain has a default RPC URL pointing to a public node.
    expect(env.UNICHAIN_RPC_URL).toMatch(/^https?:\/\//);
    expect(env.MAINNET_RPC_URL).toMatch(/^https?:\/\//);
    expect(env.BASE_RPC_URL).toMatch(/^https?:\/\//);
    expect(env.ARBITRUM_RPC_URL).toMatch(/^https?:\/\//);
    expect(env.OPTIMISM_RPC_URL).toMatch(/^https?:\/\//);

    // PoolManager addresses are the canonical Uniswap deployments.
    expect(env.UNICHAIN_POOL_MANAGER).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(env.MAINNET_POOL_MANAGER).toMatch(/^0x[0-9a-fA-F]{40}$/);

    // No WSS by default.
    expect(env.UNICHAIN_WSS_URL).toBeUndefined();
    expect(env.MAINNET_WSS_URL).toBeUndefined();

    // Start blocks default to 0.
    expect(env.UNICHAIN_START_BLOCK).toBe(0);
    expect(env.MAINNET_START_BLOCK).toBe(0);
  });

  test('honors overrides', () => {
    const env = loadEnv({
      LOG_LEVEL: 'debug',
      PORT: '8080',
      MAINNET_RPC_URL: 'https://example.com/rpc',
      MAINNET_WSS_URL: 'wss://example.com/ws',
      MAINNET_START_BLOCK: '21000000',
      MAINNET_POOL_MANAGER: '0x' + 'ab'.repeat(20),
    });

    expect(env.LOG_LEVEL).toBe('debug');
    expect(env.PORT).toBe(8080);
    expect(env.MAINNET_RPC_URL).toBe('https://example.com/rpc');
    expect(env.MAINNET_WSS_URL).toBe('wss://example.com/ws');
    expect(env.MAINNET_START_BLOCK).toBe(21_000_000);
    expect(env.MAINNET_POOL_MANAGER).toBe('0x' + 'ab'.repeat(20));
  });

  test('rejects malformed addresses', () => {
    expect(() =>
      loadEnv({
        MAINNET_POOL_MANAGER: 'not-an-address',
      }),
    ).toThrow(/MAINNET_POOL_MANAGER/);
  });

  test('rejects malformed URLs', () => {
    expect(() =>
      loadEnv({
        MAINNET_RPC_URL: 'ftp://nope',
      }),
    ).toThrow(/MAINNET_RPC_URL/);
  });

  test('rejects out-of-range ports', () => {
    expect(() =>
      loadEnv({
        PORT: '70000',
      }),
    ).toThrow(/PORT/);
  });

  test('rejects unknown LOG_LEVEL', () => {
    expect(() =>
      loadEnv({
        LOG_LEVEL: 'verbose',
      }),
    ).toThrow(/LOG_LEVEL/);
  });

  test('rejects negative start blocks', () => {
    expect(() =>
      loadEnv({
        MAINNET_START_BLOCK: '-1',
      }),
    ).toThrow(/MAINNET_START_BLOCK/);
  });
});
