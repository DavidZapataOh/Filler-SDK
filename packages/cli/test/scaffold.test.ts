import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { scaffoldProject } from '../src/scaffold';

describe('scaffoldProject (Plan 01 stub)', () => {
  let baseDir: string;
  let targetDir: string;

  beforeEach(() => {
    baseDir = mkdtempSync(join(tmpdir(), 'create-filler-test-'));
    targetDir = join(baseDir, 'my-test-solver');
  });

  afterEach(() => {
    if (existsSync(baseDir)) {
      rmSync(baseDir, { recursive: true, force: true });
    }
  });

  test('creates target dir + skeleton files', async () => {
    await scaffoldProject({
      targetDir,
      projectName: 'my-test-solver',
      vertical: 'simple-jit',
      chain: 'unichain',
      indexerUrl: 'http://localhost:42069',
      useKeeperHub: false,
      initGit: false,
    });

    expect(existsSync(join(targetDir, 'package.json'))).toBe(true);
    expect(existsSync(join(targetDir, 'README.md'))).toBe(true);
    expect(existsSync(join(targetDir, '.gitignore'))).toBe(true);
    expect(existsSync(join(targetDir, '.env.example'))).toBe(true);
    // simple-jit overlay ships 4 src files: config / strategy / filler / stake.
    expect(existsSync(join(targetDir, 'src/filler.ts'))).toBe(true);
    expect(existsSync(join(targetDir, 'src/config.ts'))).toBe(true);
    expect(existsSync(join(targetDir, 'src/strategy.ts'))).toBe(true);
    expect(existsSync(join(targetDir, 'src/stake.ts'))).toBe(true);
  });

  test('package.json has the right name + dependencies', async () => {
    await scaffoldProject({
      targetDir,
      projectName: 'my-test-solver',
      vertical: 'simple-jit',
      chain: 'unichain',
      indexerUrl: 'http://localhost:42069',
      useKeeperHub: false,
      initGit: false,
    });

    const pkg = JSON.parse(
      readFileSync(join(targetDir, 'package.json'), 'utf-8'),
    ) as Record<string, unknown>;
    expect(pkg['name']).toBe('my-test-solver');
    expect(pkg['type']).toBe('module');
    const deps = pkg['dependencies'] as Record<string, string>;
    expect(deps['@filler-sdk/sdk']).toBeDefined();
    expect(deps['viem']).toBeDefined();
  });

  test('.env.example documents indexer URL + private key + RPC', async () => {
    await scaffoldProject({
      targetDir,
      projectName: 'my-test-solver',
      vertical: 'simple-jit',
      chain: 'base',
      indexerUrl: 'https://hints.filler.xyz',
      useKeeperHub: false,
      initGit: false,
    });
    const env = readFileSync(join(targetDir, '.env.example'), 'utf-8');
    expect(env).toContain('SOLVER_PRIVATE_KEY=');
    expect(env).toContain('RPC_URL=');
    expect(env).toContain('INDEXER_URL=https://hints.filler.xyz');
    expect(env).not.toContain('KEEPERHUB_API_KEY');
  });

  test('.env.example INCLUDES KeeperHub vars when useKeeperHub=true', async () => {
    await scaffoldProject({
      targetDir,
      projectName: 'my-test-solver',
      vertical: 'simple-jit',
      chain: 'unichain',
      indexerUrl: 'http://localhost:42069',
      useKeeperHub: true,
      initGit: false,
    });
    const env = readFileSync(join(targetDir, '.env.example'), 'utf-8');
    expect(env).toContain('KEEPERHUB_API_KEY=');
    expect(env).toContain('KEEPERHUB_BASE_URL=');
  });

  test('README captures the chosen vertical + chain', async () => {
    await scaffoldProject({
      targetDir,
      projectName: 'my-test-solver',
      vertical: 'custom',
      chain: 'arbitrum',
      indexerUrl: 'http://localhost:42069',
      useKeeperHub: false,
      initGit: false,
    });
    const readme = readFileSync(join(targetDir, 'README.md'), 'utf-8');
    expect(readme).toContain('my-test-solver');
    expect(readme).toContain('custom');
    expect(readme).toContain('arbitrum');
  });

  test('throws when target dir already exists', async () => {
    await scaffoldProject({
      targetDir,
      projectName: 'my-test-solver',
      vertical: 'simple-jit',
      chain: 'unichain',
      indexerUrl: 'http://localhost:42069',
      useKeeperHub: false,
      initGit: false,
    });
    await expect(
      scaffoldProject({
        targetDir,
        projectName: 'my-test-solver',
        vertical: 'simple-jit',
        chain: 'unichain',
        indexerUrl: 'http://localhost:42069',
        useKeeperHub: false,
        initGit: false,
      }),
    ).rejects.toThrow();
  });

  test('simple-jit src/filler.ts renders with KeeperHub block when useKeeperHub=true', async () => {
    await scaffoldProject({
      targetDir,
      projectName: 'my-test-solver',
      vertical: 'simple-jit',
      chain: 'optimism',
      indexerUrl: 'http://localhost:42069',
      useKeeperHub: true,
      initGit: false,
    });
    const filler = readFileSync(join(targetDir, 'src/filler.ts'), 'utf-8');
    expect(filler).toContain('keeperHub:');
    expect(filler).toContain('useKeeperHub: true');
    expect(filler).toContain('my-test-solver');
  });

  test('simple-jit src/filler.ts WITHOUT KeeperHub omits the block', async () => {
    await scaffoldProject({
      targetDir,
      projectName: 'my-test-solver',
      vertical: 'simple-jit',
      chain: 'unichain',
      indexerUrl: 'http://localhost:42069',
      useKeeperHub: false,
      initGit: false,
    });
    const filler = readFileSync(join(targetDir, 'src/filler.ts'), 'utf-8');
    expect(filler).not.toContain('keeperHub:');
    expect(filler).not.toContain('useKeeperHub: true');
  });
});
