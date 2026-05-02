import { describe, expect, test } from 'vitest';

import { decodeCallbackData, encodeCallbackData } from '../../src/fills/encoding';
import { makeFillParams, TEST_ADDRESSES } from './fixtures';

describe('encodeCallbackData / decodeCallbackData', () => {
  test('round-trips a single FillParams', () => {
    const params = makeFillParams({
      tickLower: -240,
      tickUpper: 240,
      inputAmount: 9_999_999_999_999n,
      outputAmount: 4_888_888_888_888n,
      liquidityDelta: 7_777_777_777_777n,
      feesCaptured: 11_111n,
      deadline: 9_888_777_666_555n,
    });
    const encoded = encodeCallbackData([params]);
    const decoded = decodeCallbackData(encoded);
    expect(decoded.length).toBe(1);
    const r = decoded[0];
    expect(r).toBeDefined();
    if (r === undefined) throw new Error('unreachable');
    expect(r.poolKey).toEqual(params.poolKey);
    expect(r.inputCurrency).toBe(params.inputCurrency);
    expect(r.outputCurrency).toBe(params.outputCurrency);
    expect(r.inputAmount).toBe(params.inputAmount);
    expect(r.outputAmount).toBe(params.outputAmount);
    expect(r.zeroForOne).toBe(params.zeroForOne);
    expect(r.tickLower).toBe(params.tickLower);
    expect(r.tickUpper).toBe(params.tickUpper);
    expect(r.liquidityDelta).toBe(params.liquidityDelta);
    expect(r.feesCaptured).toBe(params.feesCaptured);
    expect(r.deadline).toBe(params.deadline);
  });

  test('round-trips a batch of three FillParams', () => {
    const batch = [
      makeFillParams({ inputAmount: 100n }),
      makeFillParams({ inputAmount: 200n, zeroForOne: false }),
      makeFillParams({ inputAmount: 300n, tickLower: -60, tickUpper: 60 }),
    ];
    const encoded = encodeCallbackData(batch);
    const decoded = decodeCallbackData(encoded);
    expect(decoded.length).toBe(3);
    expect(decoded.map((p) => p.inputAmount)).toEqual([100n, 200n, 300n]);
    expect(decoded[1]?.zeroForOne).toBe(false);
    expect(decoded[2]?.tickLower).toBe(-60);
  });

  test('encodes an empty array', () => {
    const encoded = encodeCallbackData([]);
    const decoded = decodeCallbackData(encoded);
    expect(decoded).toEqual([]);
  });

  test('preserves PoolKey 5-tuple field order (currency0, currency1, fee, tickSpacing, hooks)', () => {
    const params = makeFillParams({
      poolKey: {
        currency0: TEST_ADDRESSES.TOKEN_A,
        currency1: TEST_ADDRESSES.TOKEN_B,
        fee: 500,
        tickSpacing: 10,
        hooks: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      },
    });
    const decoded = decodeCallbackData(encodeCallbackData([params]));
    expect(decoded[0]?.poolKey.fee).toBe(500);
    expect(decoded[0]?.poolKey.tickSpacing).toBe(10);
    expect(decoded[0]?.poolKey.hooks.toLowerCase()).toBe(
      '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
    );
  });
});
