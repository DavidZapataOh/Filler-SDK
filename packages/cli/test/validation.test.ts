import { describe, expect, test } from 'vitest';

import {
  CHAINS,
  CHAIN_VALUES,
  CliConfigSchema,
  DEFAULT_INDEXER_URL,
  IndexerUrlSchema,
  ProjectNameSchema,
  VERTICALS,
  VERTICAL_VALUES,
  getChain,
  getVertical,
  isChainName,
  isVerticalKey,
} from '../src/validation';

describe('ProjectNameSchema', () => {
  test('accepts a typical project name', () => {
    expect(ProjectNameSchema.safeParse('my-solver').success).toBe(true);
    expect(ProjectNameSchema.safeParse('a').success).toBe(true);
    expect(ProjectNameSchema.safeParse('my-cool-solver-2').success).toBe(true);
  });

  test('rejects empty', () => {
    expect(ProjectNameSchema.safeParse('').success).toBe(false);
  });

  test('rejects uppercase', () => {
    expect(ProjectNameSchema.safeParse('MySolver').success).toBe(false);
  });

  test('rejects spaces', () => {
    expect(ProjectNameSchema.safeParse('my solver').success).toBe(false);
  });

  test('rejects leading hyphen / digit', () => {
    expect(ProjectNameSchema.safeParse('-solver').success).toBe(false);
    expect(ProjectNameSchema.safeParse('1solver').success).toBe(false);
  });

  test('rejects trailing hyphen', () => {
    expect(ProjectNameSchema.safeParse('solver-').success).toBe(false);
  });

  test('rejects consecutive hyphens', () => {
    expect(ProjectNameSchema.safeParse('my--solver').success).toBe(false);
  });

  test('rejects 101+ chars', () => {
    expect(ProjectNameSchema.safeParse('a' + 'b'.repeat(100)).success).toBe(
      false,
    );
  });

  test('rejects npm scopes (out of scope for filesystem-first names)', () => {
    expect(ProjectNameSchema.safeParse('@scope/name').success).toBe(false);
  });
});

describe('VERTICALS table', () => {
  test('has the four expected vertical keys', () => {
    expect(VERTICAL_VALUES).toEqual([
      'simple-jit',
      'lvr-aware',
      'treasury-rebalance',
      'custom',
    ]);
  });

  test('only simple-jit + custom are available in Plan 01', () => {
    const available = VERTICALS.filter((v) => v.available).map((v) => v.value);
    expect(available).toEqual(['simple-jit', 'custom']);
  });

  test('isVerticalKey type guard', () => {
    expect(isVerticalKey('simple-jit')).toBe(true);
    expect(isVerticalKey('not-real')).toBe(false);
  });

  test('getVertical happy + error', () => {
    expect(getVertical('simple-jit').label).toContain('Simple JIT');
    expect(() => getVertical('mystery' as never)).toThrow();
  });
});

describe('CHAINS table', () => {
  test('has all 8 chains matching the SDK registry (5 mainnets + 3 testnets)', () => {
    expect(CHAIN_VALUES).toEqual([
      'unichain',
      'mainnet',
      'arbitrum',
      'base',
      'optimism',
      'sepolia',
      'unichainSepolia',
      'foundry',
    ]);
    const testnets = CHAINS.filter((c) => c.testnet).map((c) => c.value);
    expect(testnets).toEqual(['sepolia', 'unichainSepolia', 'foundry']);
  });

  test('isChainName type guard', () => {
    expect(isChainName('unichain')).toBe(true);
    expect(isChainName('not-real')).toBe(false);
  });

  test('getChain happy + error', () => {
    expect(getChain('unichain').label).toContain('Unichain');
    expect(() => getChain('mystery' as never)).toThrow();
  });
});

describe('IndexerUrlSchema', () => {
  test('accepts https URLs', () => {
    expect(
      IndexerUrlSchema.safeParse('https://hints.filler.xyz').success,
    ).toBe(true);
  });

  test('accepts http://localhost', () => {
    expect(IndexerUrlSchema.safeParse(DEFAULT_INDEXER_URL).success).toBe(true);
    expect(
      IndexerUrlSchema.safeParse('http://localhost:42069/depth').success,
    ).toBe(true);
    expect(
      IndexerUrlSchema.safeParse('http://127.0.0.1:42069').success,
    ).toBe(true);
  });

  test('rejects http://anywhere-else', () => {
    expect(
      IndexerUrlSchema.safeParse('http://api.example.com').success,
    ).toBe(false);
  });

  test('DEFAULT_INDEXER_URL points at jit-hints port 42069', () => {
    expect(DEFAULT_INDEXER_URL).toBe('http://localhost:42069');
  });
});

describe('CliConfigSchema (combined)', () => {
  const valid = {
    projectName: 'my-solver',
    vertical: 'simple-jit' as const,
    chain: 'unichain' as const,
    indexerUrl: 'http://localhost:42069',
    useKeeperHub: false,
    initGit: true,
    install: true,
  };

  test('accepts a fully-valid config', () => {
    expect(CliConfigSchema.safeParse(valid).success).toBe(true);
  });

  test('strict mode rejects unknown keys', () => {
    expect(
      CliConfigSchema.safeParse({ ...valid, mystery: 'field' }).success,
    ).toBe(false);
  });

  test('rejects missing required field', () => {
    const { vertical: _vertical, ...rest } = valid;
    expect(CliConfigSchema.safeParse(rest).success).toBe(false);
  });

  test('rejects invalid project name passthrough', () => {
    expect(
      CliConfigSchema.safeParse({ ...valid, projectName: 'BAD NAME' }).success,
    ).toBe(false);
  });
});
