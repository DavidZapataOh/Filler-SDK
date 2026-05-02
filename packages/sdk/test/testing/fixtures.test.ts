import { describe, expect, expectTypeOf, test } from 'vitest';

import {
  TEST_ADDRESSES,
  type DepthHint,
  type FillParams,
  type FillResult,
  type Intent,
  type PoolInfo,
  type PoolKey,
  mockChainStatus,
  mockDepthHint,
  mockFillParams,
  mockFillResult,
  mockIntent,
  mockPoolInfo,
  mockPoolKey,
  mockResolvedOutput,
  mockTokenAmount,
} from '../../src/testing';

describe('testing/fixtures — type compliance', () => {
  test('mockIntent returns a valid Intent', () => {
    const i = mockIntent();
    expectTypeOf(i).toEqualTypeOf<Intent>();
    expect(i.reactor).toBe(TEST_ADDRESSES.REACTOR);
    expect(i.swapper).toBe(TEST_ADDRESSES.SWAPPER);
    expect(typeof i.deadline).toBe('bigint');
    expect(typeof i.nonce).toBe('bigint');
    expect(typeof i.observedAt).toBe('bigint');
    expect(i.outputs.length).toBe(1);
    expect(i.input.token).toBe(TEST_ADDRESSES.TOKEN_A);
  });

  test('mockIntent honors overrides', () => {
    const i = mockIntent({ chainId: 1, nonce: 999n });
    expect(i.chainId).toBe(1);
    expect(i.nonce).toBe(999n);
    expect(i.swapper).toBe(TEST_ADDRESSES.SWAPPER); // default preserved
  });

  test('mockPoolKey returns a valid PoolKey', () => {
    const k = mockPoolKey();
    expectTypeOf(k).toEqualTypeOf<PoolKey>();
    expect(k.tickSpacing).toBe(60);
    expect(k.currency0).toBe(TEST_ADDRESSES.TOKEN_A);
  });

  test('mockPoolInfo returns a valid PoolInfo', () => {
    const p = mockPoolInfo();
    expectTypeOf(p).toEqualTypeOf<PoolInfo>();
    expect(typeof p.sqrtPriceX96).toBe('bigint');
    expect(typeof p.liquidity).toBe('bigint');
    expect(p.tick).toBe(0);
  });

  test('mockFillParams matches the Solidity FillParams struct', () => {
    const p = mockFillParams();
    expectTypeOf(p).toEqualTypeOf<FillParams>();
    expect(p.tickLower).toBe(-120);
    expect(p.tickUpper).toBe(120);
    expect(typeof p.liquidityDelta).toBe('bigint');
    expect(typeof p.feesCaptured).toBe('bigint');
    expect(typeof p.deadline).toBe('bigint');
  });

  test('mockFillResult includes intent + params + canonical fields', () => {
    const r = mockFillResult();
    expectTypeOf(r).toEqualTypeOf<FillResult>();
    expect(r.txHash).toBe(TEST_ADDRESSES.TX_HASH);
    expect(typeof r.gasUsed).toBe('bigint');
    expect(typeof r.effectiveGasPriceWei).toBe('bigint');
    expect(typeof r.feeCapturedAmount).toBe('bigint');
    expect(r.intent).toBeDefined();
    expect(r.params).toBeDefined();
  });

  test('mockDepthHint includes hint + poolState', () => {
    const h = mockDepthHint();
    expectTypeOf(h).toEqualTypeOf<DepthHint>();
    expect(h.hint.tickLower).toBe(-120);
    expect(typeof h.hint.liquidityDelta).toBe('bigint');
    expect(h.poolState?.currentTick).toBe(0);
  });

  test('mockTokenAmount + mockResolvedOutput', () => {
    expect(mockTokenAmount({ amount: 999n }).amount).toBe(999n);
    expect(mockResolvedOutput({ recipient: TEST_ADDRESSES.SWAPPER }).recipient).toBe(
      TEST_ADDRESSES.SWAPPER,
    );
  });

  test('mockChainStatus returns sensible defaults', () => {
    const s = mockChainStatus();
    expect(s.chainId).toBe(130);
    expect(typeof s.latestBlock).toBe('bigint');
  });

  test('TEST_ADDRESSES exposes a frozen address pool', () => {
    expect(TEST_ADDRESSES.HOOKLESS).toBe(
      '0x0000000000000000000000000000000000000000',
    );
    expect(TEST_ADDRESSES.POOL_ID.length).toBe(66);
  });
});
