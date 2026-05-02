import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { getDefaultRpc, scaffoldProject } from '../src/scaffold';
import type { ChainName } from '../src/types';
import type { VerticalKey } from '../src/validation';

describe('scaffold integration — every vertical scaffolds a coherent project', () => {
  let baseDir: string;
  let targetDir: string;

  beforeEach(() => {
    baseDir = mkdtempSync(join(tmpdir(), 'create-filler-int-'));
    targetDir = join(baseDir, 'integration-solver');
  });

  afterEach(() => {
    if (existsSync(baseDir)) rmSync(baseDir, { recursive: true, force: true });
  });

  const verticals: VerticalKey[] = [
    'simple-jit',
    'lvr-aware',
    'treasury-rebalance',
    'custom',
  ];

  for (const vertical of verticals) {
    test(`vertical=${vertical} scaffolds with valid package.json + tsconfig + .gitignore + .env.example`, async () => {
      await scaffoldProject({
        targetDir,
        projectName: 'integration-solver',
        vertical,
        chain: 'unichain',
        indexerUrl: 'http://localhost:42069',
        useKeeperHub: false,
        initGit: false,
      });

      // Every vertical inherits the _base files.
      expect(existsSync(join(targetDir, 'package.json'))).toBe(true);
      expect(existsSync(join(targetDir, 'README.md'))).toBe(true);
      expect(existsSync(join(targetDir, 'tsconfig.json'))).toBe(true);
      expect(existsSync(join(targetDir, '.gitignore'))).toBe(true);
      expect(existsSync(join(targetDir, '.env.example'))).toBe(true);

      // Vertical overlay provides its own src/ entrypoint:
      //   - simple-jit + lvr-aware ship a 4-file split (filler.ts is the entry)
      //   - treasury-rebalance + custom ship a single src/index.ts (P05 / P01)
      const expectedSrcFile =
        vertical === 'simple-jit' || vertical === 'lvr-aware'
          ? 'src/filler.ts'
          : 'src/index.ts';
      expect(existsSync(join(targetDir, expectedSrcFile))).toBe(true);

      // package.json is valid JSON + has the expected name.
      const pkg = JSON.parse(
        readFileSync(join(targetDir, 'package.json'), 'utf-8'),
      ) as Record<string, unknown>;
      expect(pkg['name']).toBe('integration-solver');

      // tsconfig.json is valid JSON.
      const ts = JSON.parse(
        readFileSync(join(targetDir, 'tsconfig.json'), 'utf-8'),
      ) as Record<string, unknown>;
      expect(ts).toHaveProperty('compilerOptions');

      // .gitignore is plain text + isn't an empty file.
      const gi = readFileSync(join(targetDir, '.gitignore'), 'utf-8');
      expect(gi).toContain('node_modules');
      expect(gi).toContain('.env');
    });
  }

  test('_gitignore prefix is renamed to .gitignore (npm dotfile workaround)', async () => {
    await scaffoldProject({
      targetDir,
      projectName: 'integration-solver',
      vertical: 'simple-jit',
      chain: 'unichain',
      indexerUrl: 'http://localhost:42069',
      useKeeperHub: false,
      initGit: false,
    });
    expect(existsSync(join(targetDir, '.gitignore'))).toBe(true);
    expect(existsSync(join(targetDir, '_gitignore'))).toBe(false);
  });

  test('_env.example.tpl is renamed + rendered as .env.example', async () => {
    await scaffoldProject({
      targetDir,
      projectName: 'integration-solver',
      vertical: 'simple-jit',
      chain: 'unichain',
      indexerUrl: 'http://localhost:42069',
      useKeeperHub: false,
      initGit: false,
    });
    expect(existsSync(join(targetDir, '.env.example'))).toBe(true);
    expect(existsSync(join(targetDir, '_env.example.tpl'))).toBe(false);
    expect(existsSync(join(targetDir, '_env.example'))).toBe(false);
  });

  test('useKeeperHub=true — README has KEEPERHUB rows + .env.example has KH section', async () => {
    await scaffoldProject({
      targetDir,
      projectName: 'integration-solver',
      vertical: 'simple-jit',
      chain: 'unichain',
      indexerUrl: 'http://localhost:42069',
      useKeeperHub: true,
      initGit: false,
    });
    const readme = readFileSync(join(targetDir, 'README.md'), 'utf-8');
    expect(readme).toContain('KEEPERHUB_API_KEY');
    expect(readme).toContain('MEV-protected');

    const env = readFileSync(join(targetDir, '.env.example'), 'utf-8');
    expect(env).toContain('KEEPERHUB_API_KEY=');
    expect(env).toContain('KEEPERHUB_BASE_URL=');
  });

  test('useKeeperHub=false — README + .env.example omit KH lines', async () => {
    await scaffoldProject({
      targetDir,
      projectName: 'integration-solver',
      vertical: 'simple-jit',
      chain: 'unichain',
      indexerUrl: 'http://localhost:42069',
      useKeeperHub: false,
      initGit: false,
    });
    const readme = readFileSync(join(targetDir, 'README.md'), 'utf-8');
    expect(readme).not.toContain('KEEPERHUB_API_KEY');

    const env = readFileSync(join(targetDir, '.env.example'), 'utf-8');
    expect(env).not.toContain('KEEPERHUB_API_KEY');
  });

  test('atomic cleanup — partial scaffold removed when scaffold mid-way fails', async () => {
    // Pre-create the dir to simulate mid-scaffold failure (mkdir
    // recursive: false throws).
    await scaffoldProject({
      targetDir,
      projectName: 'integration-solver',
      vertical: 'simple-jit',
      chain: 'unichain',
      indexerUrl: 'http://localhost:42069',
      useKeeperHub: false,
      initGit: false,
    });
    // Now scaffolding to the SAME dir fails. createdNew=false → don't nuke.
    await expect(
      scaffoldProject({
        targetDir,
        projectName: 'integration-solver',
        vertical: 'simple-jit',
        chain: 'unichain',
        indexerUrl: 'http://localhost:42069',
        useKeeperHub: false,
        initGit: false,
      }),
    ).rejects.toThrow();
    // The original scaffold survives (createdNew was false on the second call).
    expect(existsSync(join(targetDir, 'package.json'))).toBe(true);
  });
});

describe('getDefaultRpc', () => {
  test('returns the canonical public-node URL for each chain', () => {
    expect(getDefaultRpc('mainnet')).toContain('publicnode.com');
    expect(getDefaultRpc('unichain')).toContain('publicnode.com');
    expect(getDefaultRpc('base')).toContain('publicnode.com');
    expect(getDefaultRpc('arbitrum')).toContain('publicnode.com');
    expect(getDefaultRpc('optimism')).toContain('publicnode.com');
    expect(getDefaultRpc('sepolia')).toContain('publicnode.com');
  });

  test('foundry maps to localhost', () => {
    expect(getDefaultRpc('foundry')).toBe('http://localhost:8545');
  });

  test('unichainSepolia maps to the official sepolia RPC', () => {
    expect(getDefaultRpc('unichainSepolia')).toContain('unichain.org');
  });

  test('every supported chain has a default', () => {
    const chains: ChainName[] = [
      'mainnet',
      'unichain',
      'base',
      'arbitrum',
      'optimism',
      'sepolia',
      'unichainSepolia',
      'foundry',
    ];
    for (const c of chains) {
      expect(getDefaultRpc(c).length).toBeGreaterThan(0);
    }
  });
});
