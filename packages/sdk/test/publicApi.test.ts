import { describe, expect, expectTypeOf, test } from 'vitest';

import * as sdk from '../src/index';

/**
 * Public API surface guard.
 *
 * Plan 01 ships scaffolding — the impls of intents/fills/indexer arrive in
 * Plans 02-09. But the *shape* of what we export here is the API contract;
 * downstream packages (`create-filler`, `apps/dashboard`, examples) author
 * against it today. These tests fail loudly if a refactor accidentally
 * removes / renames an export.
 */

describe('@filler-sdk/sdk — public exports', () => {
  test('SDK_VERSION is a 0.0.0 const', () => {
    expect(sdk.SDK_VERSION).toBe('0.0.0');
    expectTypeOf(sdk.SDK_VERSION).toEqualTypeOf<'0.0.0'>();
  });

  test('createFiller + resolveFillerConfig are exported as fns', () => {
    expect(typeof sdk.createFiller).toBe('function');
    expect(typeof sdk.resolveFillerConfig).toBe('function');
  });

  test('chain registry is frozen + has all 5 mainnets + 2 testnets', () => {
    expect(Object.isFrozen(sdk.chains)).toBe(true);
    expect(Object.keys(sdk.chains).sort()).toEqual([
      'arbitrum',
      'base',
      'mainnet',
      'optimism',
      'sepolia',
      'unichain',
      'unichainSepolia',
    ]);
  });

  test('isSupportedChainId narrows correctly for testnets too', () => {
    expect(sdk.isSupportedChainId(11_155_111)).toBe(true);
    expect(sdk.isSupportedChainId(11_155_420)).toBe(true);
  });

  test('getViemChain returns a viem Chain object for each supported id', () => {
    for (const id of [1, 130, 8453, 42161, 10, 11_155_111, 11_155_420] as const) {
      const chain = sdk.getViemChain(id);
      expect(chain.id).toBe(id);
      expect(typeof chain.name).toBe('string');
    }
  });

  test('getViemChain throws on unsupported id', () => {
    expect(() => sdk.getViemChain(999_999 as never)).toThrow(/Unsupported/);
  });

  test('isSupportedChainId narrows correctly', () => {
    expect(sdk.isSupportedChainId(1)).toBe(true);
    expect(sdk.isSupportedChainId(130)).toBe(true);
    expect(sdk.isSupportedChainId(8453)).toBe(true);
    expect(sdk.isSupportedChainId(999_999)).toBe(false);
  });

  test('getDeployedAddresses applies overrides on top of canonical', () => {
    const overridden = sdk.getDeployedAddresses('unichain', {
      filler: '0x1111111111111111111111111111111111111111',
    });
    expect(overridden.filler).toBe('0x1111111111111111111111111111111111111111');
    // Canonical PoolManager is preserved.
    expect(overridden.poolManager).toBe(
      '0x1f98400000000000000000000000000000000004',
    );
  });

  test('all error classes are subclasses of FillerError', () => {
    const errors = [
      new sdk.ConfigInvalidError('x'),
      new sdk.IntentExpiredError(0n, 0n),
      new sdk.InsufficientLiquidityError('x'),
      new sdk.RPCError('x'),
      new sdk.IndexerError('x'),
      new sdk.SimulationRevertedError('x'),
      new sdk.BroadcastFailedError('x'),
      new sdk.TimeoutError('x'),
    ];
    for (const err of errors) {
      expect(err).toBeInstanceOf(sdk.FillerError);
      expect(err).toBeInstanceOf(Error);
      expect(err.code).toBeDefined();
      expect(typeof err.toJSON).toBe('function');
    }
  });

  test('FillerError.toJSON omits cause field when not provided', () => {
    const err = new sdk.RPCError('connection refused');
    const json = err.toJSON();
    expect(json['name']).toBe('RPCError');
    expect(json['code']).toBe('RPC_ERROR');
    expect(json['message']).toBe('connection refused');
  });

  test('FillerError preserves cause + context', () => {
    const cause = new Error('original');
    const err = new sdk.IndexerError('upstream 502', {
      cause,
      context: { url: '/depth', chainId: 1 },
      status: 502,
    });
    expect(err.status).toBe(502);
    expect(err.context['url']).toBe('/depth');
    expect(err.cause).toBe(cause);
  });

  test('createDefaultLogger respects level override', () => {
    const log = sdk.createDefaultLogger({ level: 'warn' });
    expect(log.level).toBe('warn');
  });
});
