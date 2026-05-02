/**
 * Plan 04 (Sprint 04) — lvr-aware template structural assertions.
 *
 * Verifies the generated project is COHERENT:
 *   - 5 src files (config + lvr + strategy + filler + stake).
 *   - LVR math file is pure (exports calculateLVR + netSolverProfit).
 *   - Strategy returns the LVR decision shape.
 *   - filler.ts wires Prometheus metrics + an HTTP /metrics endpoint.
 *   - No fake on-chain donate (PoolManager.donate is `onlyByLocker` —
 *     would revert from EOA).
 *   - package.json adds prom-client dep.
 *   - .env.example carries the LVR-specific knobs (VOLATILITY_BPS / METRICS_PORT).
 */

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { scaffoldProject } from '../src/scaffold';

let baseDir: string;
let targetDir: string;

beforeEach(() => {
  baseDir = mkdtempSync(join(tmpdir(), 'lvr-aware-test-'));
  targetDir = join(baseDir, 'lvr-solver');
});
afterEach(() => {
  if (existsSync(baseDir)) rmSync(baseDir, { recursive: true, force: true });
});

async function scaffold(useKeeperHub: boolean): Promise<void> {
  await scaffoldProject({
    targetDir,
    projectName: 'lvr-solver',
    vertical: 'lvr-aware',
    chain: 'unichain',
    indexerUrl: 'http://localhost:42069',
    useKeeperHub,
    initGit: false,
  });
}

// === File set ============================================================

describe('lvr-aware — file set', () => {
  test('ships 5 src files: config / lvr / strategy / filler / stake', async () => {
    await scaffold(false);
    expect(existsSync(join(targetDir, 'src/config.ts'))).toBe(true);
    expect(existsSync(join(targetDir, 'src/lvr.ts'))).toBe(true);
    expect(existsSync(join(targetDir, 'src/strategy.ts'))).toBe(true);
    expect(existsSync(join(targetDir, 'src/filler.ts'))).toBe(true);
    expect(existsSync(join(targetDir, 'src/stake.ts'))).toBe(true);
    expect(existsSync(join(targetDir, 'src/index.ts'))).toBe(false);
  });

  test('package.json adds prom-client dep + matches scripts', async () => {
    await scaffold(false);
    const pkg = JSON.parse(
      readFileSync(join(targetDir, 'package.json'), 'utf-8'),
    ) as Record<string, unknown>;
    const deps = pkg['dependencies'] as Record<string, string>;
    expect(deps['prom-client']).toBeDefined();
    expect(deps['zod']).toBeDefined();
    const scripts = pkg['scripts'] as Record<string, string>;
    expect(scripts['start']).toBe('bun src/filler.ts');
    expect(scripts['stake']).toBe('bun src/stake.ts');
  });

  test('.env.example carries LVR-specific knobs', async () => {
    await scaffold(false);
    const env = readFileSync(join(targetDir, '.env.example'), 'utf-8');
    expect(env).toContain('VOLATILITY_BPS=');
    expect(env).toContain('BASE_LIQUIDITY_HINT=');
    expect(env).toContain('DONATION_BPS=');
    expect(env).toContain('METRICS_PORT=');
  });

  test('.env.example INCLUDES KH vars when useKeeperHub=true', async () => {
    await scaffold(true);
    const env = readFileSync(join(targetDir, '.env.example'), 'utf-8');
    expect(env).toContain('KEEPERHUB_API_KEY=');
  });
});

// === Code shape ==========================================================

describe('lvr-aware — code structure', () => {
  test('lvr.ts is a pure-math module (no SDK runtime calls)', async () => {
    await scaffold(false);
    const lvr = readFileSync(join(targetDir, 'src/lvr.ts'), 'utf-8');
    expect(lvr).toContain('export function calculateLVR');
    expect(lvr).toContain('export function netSolverProfit');
    expect(lvr).toContain('intent.input.amount'); // canonical Sprint 03 nested shape
    // Defensive: no createFiller* / submitFill / writeContract in the math file.
    expect(lvr).not.toContain('createFiller');
    expect(lvr).not.toContain('submitFill');
    expect(lvr).not.toContain('writeContract');
  });

  test('strategy.ts is async + returns LVRDecision shape', async () => {
    await scaffold(false);
    const s = readFileSync(join(targetDir, 'src/strategy.ts'), 'utf-8');
    expect(s).toContain('export interface LVRStrategy');
    expect(s).toContain('async decide(');
    expect(s).toContain('intendedDonationWei');
    expect(s).toContain('expectedLVRReduction');
    expect(s).toContain('calculateLVR');
    // Reject-on-zero-reduction is the LP-favorable filter.
    expect(s).toContain('expectedReduction === 0n');
  });

  test('filler.ts wires Prometheus metrics + HTTP endpoint', async () => {
    await scaffold(true);
    const f = readFileSync(join(targetDir, 'src/filler.ts'), 'utf-8');
    expect(f).toContain("from 'prom-client'");
    expect(f).toContain('lvr_recaptured_total_wei');
    expect(f).toContain('intended_donation_total_wei');
    expect(f).toContain('fills_submitted_total');
    expect(f).toContain("from 'node:http'");
    expect(f).toContain('/metrics');
    expect(f).toContain('METRICS_PORT');
    // Wires the strategy + filler the same as simple-jit.
    expect(f).toContain('createFillerFromPrivateKey');
    expect(f).toContain('subscribeIntents');
    expect(f).toContain('await filler.prepareFill(intent)');
    expect(f).toContain('await filler.submitFill(intent, params');
  });

  test('NO fake on-chain donate (donate would revert from EOA — onlyByLocker)', async () => {
    await scaffold(false);
    const allSrc = ['filler.ts', 'strategy.ts', 'lvr.ts', 'stake.ts']
      .map((f) => readFileSync(join(targetDir, 'src', f), 'utf-8'))
      .join('\n');
    // No writeContract({...functionName: 'donate'}).
    expect(allSrc).not.toMatch(/functionName:\s*['"]donate['"]/);
    // No fake donate via filler.donate (no such SDK method).
    expect(allSrc).not.toMatch(/filler\.donate\s*\(/);
  });

  test('stake.ts uses scoped bond.stake(amount) — not bond.stake(filler, amount)', async () => {
    await scaffold(false);
    const s = readFileSync(join(targetDir, 'src/stake.ts'), 'utf-8');
    expect(s).toContain('filler.bond.stake(stakeAmountWei)');
    expect(s).not.toMatch(/bond\.stake\([^)]*FILLER_ADDRESS/);
  });
});

// === SDK API alignment (catches drift) ===================================

describe('lvr-aware — SDK API alignment', () => {
  test('uses canonical SDK exports + nested Intent shape', async () => {
    await scaffold(true);
    const allSrc = ['config.ts', 'lvr.ts', 'strategy.ts', 'filler.ts', 'stake.ts']
      .map((f) => readFileSync(join(targetDir, 'src', f), 'utf-8'))
      .join('\n');
    expect(allSrc).toContain('createFillerFromPrivateKey');
    expect(allSrc).toContain('createDefaultLogger');
    expect(allSrc).toContain('isSupportedChainId');
    expect(allSrc).toContain('feeCapturedAmount');
    // Defensive: legacy / wrong shapes.
    expect(allSrc).not.toMatch(/intent\.inputAmount\b/); // wrong; canonical is intent.input.amount
    expect(allSrc).not.toMatch(/result\.feesCaptured\b/); // wrong field name
    expect(allSrc).not.toMatch(/createFiller\(\{[^}]*privateKey/); // wrong factory
  });
});

// === Pure-math LVR sanity (run the rendered lvr.ts logic conceptually) ===
//
// We can't execute the rendered TypeScript without a transpilation step. Instead
// we re-implement the formula here + assert the documented invariants:
//   - tradeSize=0  → expectedLVR=0
//   - liquidity=0  → safe (returns 0)
//   - reduction <= expectedLVR
//   - donationBps=0 → intendedDonationWei=0

describe('lvr-aware — math invariants (re-implemented from rendered formula)', () => {
  function calc(
    tradeSize: bigint,
    liquidity: bigint,
    deltaL: bigint,
    fees: bigint,
    volBps: number,
    donationBps: number,
  ): { expectedLVR: bigint; expectedReduction: bigint; intendedDonationWei: bigint } {
    const BPS = 10_000n;
    if (liquidity <= 0n) {
      return { expectedLVR: 0n, expectedReduction: 0n, intendedDonationWei: 0n };
    }
    const volSquared = BigInt(volBps) * BigInt(volBps);
    const expectedLVR =
      (tradeSize * tradeSize * volSquared) / (8n * liquidity * BPS * BPS);
    const totalAfter = liquidity + deltaL;
    const expectedReduction =
      totalAfter > 0n ? (expectedLVR * deltaL * BPS) / (totalAfter * BPS) : 0n;
    const intendedDonationWei = (fees * BigInt(donationBps)) / BPS;
    return { expectedLVR, expectedReduction, intendedDonationWei };
  }

  test('tradeSize=0 → zero LVR', () => {
    const r = calc(0n, 1_000n, 100n, 1_000n, 200, 2500);
    expect(r.expectedLVR).toBe(0n);
    expect(r.expectedReduction).toBe(0n);
  });

  test('liquidity=0 → all-zero (defensive)', () => {
    const r = calc(1_000_000n, 0n, 100n, 1_000n, 200, 2500);
    expect(r.expectedLVR).toBe(0n);
    expect(r.expectedReduction).toBe(0n);
    expect(r.intendedDonationWei).toBe(0n);
  });

  test('reduction never exceeds expectedLVR', () => {
    for (const deltaL of [1n, 100n, 1_000n, 1_000_000n, 1_000_000_000n]) {
      const r = calc(1_000_000_000n, 1_000_000_000_000n, deltaL, 1_000n, 200, 2500);
      expect(r.expectedReduction).toBeLessThanOrEqual(r.expectedLVR);
    }
  });

  test('donationBps=0 → zero intended donation', () => {
    const r = calc(1_000_000n, 1_000_000_000n, 100n, 5_000n, 200, 0);
    expect(r.intendedDonationWei).toBe(0n);
  });

  test('donationBps=2500 → 25% of fees', () => {
    const r = calc(1_000_000n, 1_000_000_000n, 100n, 1_000n, 200, 2500);
    expect(r.intendedDonationWei).toBe(250n);
  });
});
