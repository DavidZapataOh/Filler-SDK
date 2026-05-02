/**
 * Plan 03 (Sprint 04) — simple-jit template structural assertions.
 *
 * Verifies the generated project is COHERENT — every file references the
 * right SDK functions, env vars flow correctly, KeeperHub is conditional, and
 * the LOC budget is respected. Doesn't run `bun install` or `tsc`; that's
 * Plan 04's CI deliverable.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { scaffoldProject } from '../src/scaffold';

let baseDir: string;
let targetDir: string;

beforeEach(() => {
  baseDir = mkdtempSync(join(tmpdir(), 'simple-jit-test-'));
  targetDir = join(baseDir, 'sj-solver');
});
afterEach(() => {
  if (existsSync(baseDir)) rmSync(baseDir, { recursive: true, force: true });
});

async function scaffold(useKeeperHub: boolean): Promise<void> {
  await scaffoldProject({
    targetDir,
    projectName: 'sj-solver',
    vertical: 'simple-jit',
    chain: 'unichain',
    indexerUrl: 'http://localhost:42069',
    useKeeperHub,
    initGit: false,
  });
}

// === File set ============================================================

describe('simple-jit — file set', () => {
  test('ships 4 src files: config / strategy / filler / stake', async () => {
    await scaffold(false);
    expect(existsSync(join(targetDir, 'src/config.ts'))).toBe(true);
    expect(existsSync(join(targetDir, 'src/strategy.ts'))).toBe(true);
    expect(existsSync(join(targetDir, 'src/filler.ts'))).toBe(true);
    expect(existsSync(join(targetDir, 'src/stake.ts'))).toBe(true);
    // No legacy index.ts from the Plan 02 placeholder.
    expect(existsSync(join(targetDir, 'src/index.ts'))).toBe(false);
  });

  test('overrides _base/package.json.tpl + README.md.tpl + _env.example.tpl', async () => {
    await scaffold(false);
    const pkg = JSON.parse(
      readFileSync(join(targetDir, 'package.json'), 'utf-8'),
    ) as Record<string, unknown>;
    // simple-jit-specific scripts.
    const scripts = pkg['scripts'] as Record<string, string>;
    expect(scripts['start']).toBe('bun src/filler.ts');
    expect(scripts['stake']).toBe('bun src/stake.ts');
    // simple-jit adds zod as a dep.
    const deps = pkg['dependencies'] as Record<string, string>;
    expect(deps['zod']).toBeDefined();
  });

  test('.env.example carries simple-jit-required vars', async () => {
    await scaffold(false);
    const env = readFileSync(join(targetDir, '.env.example'), 'utf-8');
    expect(env).toContain('SOLVER_PRIVATE_KEY=');
    expect(env).toContain('CHAIN_ID=');
    expect(env).toContain('FILLER_ADDRESS=');
    expect(env).toContain('BOND_ADDRESS=');
    expect(env).toContain('REACTOR_ADDRESS=');
    expect(env).toContain('POOL_MANAGER_ADDRESS=');
    expect(env).toContain('MIN_PROFIT_USD=');
  });

  test('.env.example INCLUDES KeeperHub vars when useKeeperHub=true', async () => {
    await scaffold(true);
    const env = readFileSync(join(targetDir, '.env.example'), 'utf-8');
    expect(env).toContain('KEEPERHUB_API_KEY=');
    expect(env).toContain('KEEPERHUB_BASE_URL=');
  });

  test('.env.example OMITS KeeperHub vars when useKeeperHub=false', async () => {
    await scaffold(false);
    const env = readFileSync(join(targetDir, '.env.example'), 'utf-8');
    expect(env).not.toContain('KEEPERHUB_API_KEY=');
  });
});

// === Code shape ==========================================================

describe('simple-jit — code structure', () => {
  test('config.ts uses Zod + isSupportedChainId from SDK', async () => {
    await scaffold(false);
    const cfg = readFileSync(join(targetDir, 'src/config.ts'), 'utf-8');
    expect(cfg).toContain("from '@filler-sdk/sdk'");
    expect(cfg).toContain('isSupportedChainId');
    expect(cfg).toContain("from 'zod'");
    expect(cfg).toContain('z.object');
    expect(cfg).toContain('SOLVER_PRIVATE_KEY');
    expect(cfg).toContain('CHAIN_ID');
    expect(cfg).toContain('export function loadConfig');
  });

  test('strategy.ts exports the Strategy interface + default impl', async () => {
    await scaffold(false);
    const s = readFileSync(join(targetDir, 'src/strategy.ts'), 'utf-8');
    expect(s).toContain('export interface Strategy');
    expect(s).toContain('filter(intent:');
    expect(s).toContain('decide(intent:');
    expect(s).toContain('export const strategy: Strategy');
  });

  test('filler.ts wires createFillerFromPrivateKey + subscribeIntents flow', async () => {
    await scaffold(true);
    const f = readFileSync(join(targetDir, 'src/filler.ts'), 'utf-8');
    expect(f).toContain('createFillerFromPrivateKey');
    expect(f).toContain('createDefaultLogger');
    expect(f).toContain('filler.subscribeIntents(strategy.filter');
    expect(f).toContain('await filler.prepareFill(intent)');
    expect(f).toContain('strategy.decide(intent, params, minProfitWei)');
    expect(f).toContain('await filler.submitFill(intent, params');
    // Graceful shutdown
    expect(f).toContain("process.on('SIGTERM'");
    expect(f).toContain("process.on('SIGINT'");
    expect(f).toContain('await filler.shutdown()');
    // KeeperHub conditional
    expect(f).toContain('keeperHub:');
    expect(f).toContain('useKeeperHub: true');
  });

  test('stake.ts uses scoped bond.stake(amount) (not bond.stake(filler, amount))', async () => {
    await scaffold(false);
    const s = readFileSync(join(targetDir, 'src/stake.ts'), 'utf-8');
    // Sprint 03 Plan 07 — BondClient is scoped at construction, single-arg method.
    expect(s).toContain('filler.bond.stake(stakeAmountWei)');
    // Defensive: the wrong shape would be `bond.stake(FILLER_ADDRESS, amount)`.
    expect(s).not.toMatch(/bond\.stake\([^)]*FILLER_ADDRESS/);
    // Default 0.1 ETH.
    expect(s).toContain('100_000_000_000_000_000n');
  });
});

// === LOC budget ==========================================================

describe('simple-jit — LOC budget (preserve "tres archivos y un bond")', () => {
  test('total code lines (excluding blanks + pure comments) under 250', async () => {
    await scaffold(true);
    const files = ['config.ts', 'strategy.ts', 'filler.ts', 'stake.ts'];
    let totalCode = 0;
    for (const f of files) {
      const text = readFileSync(join(targetDir, 'src', f), 'utf-8');
      const codeLines = text
        .split('\n')
        .filter((l) => {
          const t = l.trim();
          if (t.length === 0) return false;
          if (t.startsWith('//')) return false;
          if (t.startsWith('/*')) return false;
          if (t.startsWith('*')) return false;
          return true;
        }).length;
      totalCode += codeLines;
    }
    // Plan 03 §2 says < 250 LOC. Honest interpretation: code lines (not
    // comment lines, since comments teach the user). Hard cap 250.
    expect(totalCode).toBeLessThan(250);
  });
});

// === SDK API alignment (catches drift) ===================================

describe('simple-jit — SDK API alignment', () => {
  test('uses canonical SDK exports (no legacy field names)', async () => {
    await scaffold(true);
    const allSrc = ['config.ts', 'strategy.ts', 'filler.ts', 'stake.ts']
      .map((f) => readFileSync(join(targetDir, 'src', f), 'utf-8'))
      .join('\n');
    // Canonical names from Sprint 03.
    expect(allSrc).toContain('feeCapturedAmount'); // not `feesCaptured` on FillResult
    expect(allSrc).toContain('createFillerFromPrivateKey');
    expect(allSrc).toContain('isSupportedChainId');
    expect(allSrc).toContain('createDefaultLogger');
    // Defensive: if drift slips in, these wrong-shape patterns appear.
    expect(allSrc).not.toMatch(/result\.feesCaptured/);
    expect(allSrc).not.toMatch(/createFiller\(\{[^}]*privateKey/); // wrong factory
  });
});
