import { describe, expect, test } from 'vitest';
import { encodeAbiParameters, encodeEventTopics, keccak256, toHex } from 'viem';

import {
  decodeFillEvent,
  intentFromFillLog,
  isObservationalIntent,
  reactorFillAbi,
} from '../../src/intents/parser';

const REACTOR = '0x1111111111111111111111111111111111111111' as const;
const FILLER = '0x4444444444444444444444444444444444444444' as const;
const SWAPPER = '0x5555555555555555555555555555555555555555' as const;

function makeFillLog(args: {
  orderHash: `0x${string}`;
  filler: `0x${string}`;
  swapper: `0x${string}`;
  nonce: bigint;
}) {
  // viem's encodeEventTopics produces the [signature, indexed1, indexed2, indexed3]
  // topic array. nonce is non-indexed → goes into data.
  const topics = encodeEventTopics({
    abi: reactorFillAbi,
    eventName: 'Fill',
    args: {
      orderHash: args.orderHash,
      filler: args.filler,
      swapper: args.swapper,
    },
  });
  const data = encodeAbiParameters([{ type: 'uint256' }], [args.nonce]);
  return {
    address: REACTOR,
    topics,
    data,
    blockNumber: 100n,
    transactionHash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as `0x${string}`,
    blockHash: '0xbbbb' as `0x${string}`,
    transactionIndex: 0,
    logIndex: 0,
    removed: false,
  } as never;
}

describe('parser — decodeFillEvent', () => {
  test('decodes orderHash + filler + swapper + nonce from a Fill log', () => {
    const orderHash = keccak256(toHex('order-1'));
    const log = makeFillLog({
      orderHash,
      filler: FILLER,
      swapper: SWAPPER,
      nonce: 42n,
    });
    const decoded = decodeFillEvent(log);
    expect(decoded.orderHash).toBe(orderHash);
    expect(decoded.filler.toLowerCase()).toBe(FILLER.toLowerCase());
    expect(decoded.swapper.toLowerCase()).toBe(SWAPPER.toLowerCase());
    expect(decoded.nonce).toBe(42n);
  });

  test('throws FillerError on a non-Fill log', () => {
    const malformed = { address: REACTOR, topics: ['0xdeadbeef'], data: '0x' } as never;
    expect(() => decodeFillEvent(malformed)).toThrow(/decode/i);
  });
});

describe('parser — intentFromFillLog', () => {
  test('builds an observational Intent (sentinel rawOrder + signature)', () => {
    const orderHash = keccak256(toHex('order-2'));
    const log = makeFillLog({
      orderHash,
      filler: FILLER,
      swapper: SWAPPER,
      nonce: 7n,
    });
    const decoded = decodeFillEvent(log);
    const intent = intentFromFillLog(log, decoded, REACTOR, 130);
    expect(intent.orderHash).toBe(orderHash);
    expect(intent.swapper.toLowerCase()).toBe(SWAPPER.toLowerCase());
    expect(intent.nonce).toBe(7n);
    expect(intent.reactor).toBe(REACTOR);
    expect(intent.chainId).toBe(130);
    expect(intent.observedAt).toBe(100n);
    // Sentinels — observational intents are NOT fillable.
    expect(intent.rawOrder).toBe('0x');
    expect(intent.signature).toBe('0x');
    expect(isObservationalIntent(intent)).toBe(true);
  });

  test('isObservationalIntent — false for fully-formed intents', () => {
    const intent = {
      rawOrder: '0xdeadbeef',
      signature: '0xcafebabe',
    } as never;
    expect(isObservationalIntent(intent)).toBe(false);
  });
});
