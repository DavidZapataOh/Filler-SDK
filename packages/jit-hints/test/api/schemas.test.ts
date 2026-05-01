import { describe, expect, test } from 'vitest';

import {
  DepthQuerySchema,
  PoolIdParamSchema,
  PoolListSchema,
} from '../../src/api/schemas';

describe('DepthQuerySchema', () => {
  test('parses a valid depth query', () => {
    const r = DepthQuerySchema.safeParse({
      pool: '0x' + 'a'.repeat(64),
      size: '1000000000000000000',
      zeroForOne: 'true',
      slippageBps: '50',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.zeroForOne).toBe(true);
      expect(r.data.size).toBe('1000000000000000000');
      expect(r.data.slippageBps).toBe(50);
    }
  });

  test('defaults slippageBps to 50 when omitted', () => {
    const r = DepthQuerySchema.safeParse({
      pool: '0x' + 'a'.repeat(64),
      size: '1',
      zeroForOne: 'false',
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.slippageBps).toBe(50);
  });

  test('rejects malformed pool id', () => {
    const r = DepthQuerySchema.safeParse({
      pool: '0xnope',
      size: '1',
      zeroForOne: 'true',
    });
    expect(r.success).toBe(false);
  });

  test('rejects negative size', () => {
    const r = DepthQuerySchema.safeParse({
      pool: '0x' + 'a'.repeat(64),
      size: '-1',
      zeroForOne: 'true',
    });
    expect(r.success).toBe(false);
  });

  test('rejects non-numeric size', () => {
    const r = DepthQuerySchema.safeParse({
      pool: '0x' + 'a'.repeat(64),
      size: 'abc',
      zeroForOne: 'true',
    });
    expect(r.success).toBe(false);
  });

  test('rejects invalid zeroForOne', () => {
    const r = DepthQuerySchema.safeParse({
      pool: '0x' + 'a'.repeat(64),
      size: '1',
      zeroForOne: 'maybe',
    });
    expect(r.success).toBe(false);
  });

  test('rejects out-of-range slippageBps', () => {
    const r = DepthQuerySchema.safeParse({
      pool: '0x' + 'a'.repeat(64),
      size: '1',
      zeroForOne: 'true',
      slippageBps: '0',
    });
    expect(r.success).toBe(false);
  });
});

describe('PoolListSchema', () => {
  test('applies defaults', () => {
    const r = PoolListSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.limit).toBe(20);
      expect(r.data.offset).toBe(0);
    }
  });

  test('rejects bad token format', () => {
    const r = PoolListSchema.safeParse({ token: '0xnope' });
    expect(r.success).toBe(false);
  });

  test('rejects limit > 100', () => {
    const r = PoolListSchema.safeParse({ limit: '101' });
    expect(r.success).toBe(false);
  });
});

describe('PoolIdParamSchema', () => {
  test('parses valid id', () => {
    const r = PoolIdParamSchema.safeParse({ id: '0x' + 'b'.repeat(64) });
    expect(r.success).toBe(true);
  });

  test('rejects invalid id', () => {
    const r = PoolIdParamSchema.safeParse({ id: '0x' + 'b'.repeat(40) });
    expect(r.success).toBe(false);
  });
});
