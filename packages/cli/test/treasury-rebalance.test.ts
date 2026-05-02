/**
 * Plan 05 (Sprint 04) — treasury-rebalance HERO template structural assertions.
 *
 * The treasury-rebalance vertical is the demo's centerpiece (DAO internalises
 * the spread it currently pays to external aggregators). It ships in TWO
 * modes: DEMO (synthetic intents + MockFiller, no chain access) and
 * PRODUCTION (real createFillerFromPrivateKey + Reactor subscription).
 *
 * What we assert:
 *   - 7 src files (treasury, config, strategy, syntheticIntents,
 *     dashboardEmitter, filler, stake).
 *   - DEMO_MODE branch wires createMockFiller from `@filler-sdk/sdk/testing`.
 *   - Synthetic intent generator emits the canonical nested Intent shape
 *     (intent.input.{token,amount} + intent.outputs[]) — NOT the legacy flat
 *     `intent.inputAmount`.
 *   - Strategy filter is treasury-only + case-insensitive.
 *   - DashboardEmitter SSE structure: `event: spread-captured\ndata: ...\n\n`.
 *   - .env.example documents BOTH modes (DEMO_MODE + production fields).
 *   - package.json adds `bun demo` script (DEMO_MODE=true bun src/filler.ts).
 *   - Defensive: no `intent.inputAmount` / `result.feesCaptured` / wrong factory.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { scaffoldProject } from '../src/scaffold';

let baseDir: string;
let targetDir: string;

beforeEach(() => {
  baseDir = mkdtempSync(join(tmpdir(), 'treasury-rebalance-test-'));
  targetDir = join(baseDir, 'treasury-solver');
});
afterEach(() => {
  if (existsSync(baseDir)) rmSync(baseDir, { recursive: true, force: true });
});

async function scaffold(useKeeperHub: boolean): Promise<void> {
  await scaffoldProject({
    targetDir,
    projectName: 'treasury-solver',
    vertical: 'treasury-rebalance',
    chain: 'unichain',
    indexerUrl: 'http://localhost:42069',
    useKeeperHub,
    initGit: false,
  });
}

// === File set ============================================================

describe('treasury-rebalance — file set', () => {
  test('ships 7 src files: treasury / config / strategy / syntheticIntents / dashboardEmitter / filler / stake', async () => {
    await scaffold(false);
    expect(existsSync(join(targetDir, 'src/treasury.ts'))).toBe(true);
    expect(existsSync(join(targetDir, 'src/config.ts'))).toBe(true);
    expect(existsSync(join(targetDir, 'src/strategy.ts'))).toBe(true);
    expect(existsSync(join(targetDir, 'src/syntheticIntents.ts'))).toBe(true);
    expect(existsSync(join(targetDir, 'src/dashboardEmitter.ts'))).toBe(true);
    expect(existsSync(join(targetDir, 'src/filler.ts'))).toBe(true);
    expect(existsSync(join(targetDir, 'src/stake.ts'))).toBe(true);
    // Treasury-rebalance does NOT use a single src/index.ts entrypoint.
    expect(existsSync(join(targetDir, 'src/index.ts'))).toBe(false);
  });

  test('package.json overrides _base — adds `bun demo` script + zod dep, no prom-client', async () => {
    await scaffold(false);
    const pkg = JSON.parse(
      readFileSync(join(targetDir, 'package.json'), 'utf-8'),
    ) as Record<string, unknown>;
    const scripts = pkg['scripts'] as Record<string, string>;
    expect(scripts['start']).toBe('bun src/filler.ts');
    expect(scripts['demo']).toBe('DEMO_MODE=true bun src/filler.ts');
    expect(scripts['stake']).toBe('bun src/stake.ts');
    const deps = pkg['dependencies'] as Record<string, string>;
    expect(deps['zod']).toBeDefined();
    expect(deps['@filler-sdk/sdk']).toBeDefined();
    expect(deps['viem']).toBeDefined();
    // Treasury uses SSE (no prom-client) — that's lvr-aware's territory.
    expect(deps['prom-client']).toBeUndefined();
  });

  test('.env.example documents BOTH demo and production modes', async () => {
    await scaffold(false);
    const env = readFileSync(join(targetDir, '.env.example'), 'utf-8');
    // DEMO mode knobs (defaults visible).
    expect(env).toContain('DEMO_MODE=true');
    expect(env).toContain('DEMO_INTERVAL_SEC=');
    // Treasury / DAO config.
    expect(env).toContain('TREASURY_ADDRESS=');
    expect(env).toContain('TARGET_ALLOCATIONS=');
    expect(env).toContain('TOKEN_ADDRESSES=');
    expect(env).toContain('REBALANCE_SCHEDULE=');
    expect(env).toContain('MIN_REBALANCE_USD=');
    // Dashboard.
    expect(env).toContain('DASHBOARD_PORT=');
    // Production-only fields documented (but DEMO_MODE=true so they may be empty).
    expect(env).toContain('SOLVER_PRIVATE_KEY=');
    expect(env).toContain('FILLER_ADDRESS=');
    expect(env).toContain('REACTOR_ADDRESS=');
    expect(env).toContain('POOL_MANAGER_ADDRESS=');
    expect(env).toContain('BOND_ADDRESS=');
  });

  test('.env.example INCLUDES KH vars when useKeeperHub=true', async () => {
    await scaffold(true);
    const env = readFileSync(join(targetDir, '.env.example'), 'utf-8');
    expect(env).toContain('KEEPERHUB_API_KEY=');
    expect(env).toContain('KEEPERHUB_BASE_URL=');
  });

  test('.env.example OMITS KH vars when useKeeperHub=false', async () => {
    await scaffold(false);
    const env = readFileSync(join(targetDir, '.env.example'), 'utf-8');
    expect(env).not.toContain('KEEPERHUB_API_KEY');
  });

  test('README is the hero pitch — references DAO use cases + comparison table + DEMO MODE', async () => {
    await scaffold(false);
    const readme = readFileSync(join(targetDir, 'README.md'), 'utf-8');
    // 90-second pitch + comparison table (External aggregator vs This solver).
    expect(readme).toContain('External aggregator');
    expect(readme).toContain('Spread leaves DAO');
    expect(readme).toContain('Spread stays in DAO');
    // DAO references (Aave / Compound / ENS / Optimism / Frax).
    expect(readme).toMatch(/Aave|Compound|ENS|Optimism|Frax/);
    // DEMO MODE quickstart (~30 seconds).
    expect(readme).toContain('DEMO MODE');
    expect(readme).toContain('PRODUCTION MODE');
    // Dashboard SSE integration.
    expect(readme).toContain('/events');
    expect(readme).toContain('spread-captured');
  });
});

// === Code shape — strategy ===============================================

describe('treasury-rebalance — strategy.ts', () => {
  test('filter is treasury-only + case-insensitive', async () => {
    await scaffold(false);
    const s = readFileSync(join(targetDir, 'src/strategy.ts'), 'utf-8');
    expect(s).toContain('export interface TreasuryStrategy');
    expect(s).toContain('createTreasuryStrategy');
    expect(s).toContain('intent.swapper.toLowerCase()');
    expect(s).toContain('treasuryAddress.toLowerCase()');
    // Always-fill: DAO is paying itself.
    expect(s).toMatch(/decide\([\s\S]*?\)\s*:\s*boolean[\s\S]*?return\s+true/);
  });
});

// === Code shape — synthetic intent generator =============================

describe('treasury-rebalance — syntheticIntents.ts', () => {
  test('emits canonical nested Intent shape (input.{token,amount} + outputs[])', async () => {
    await scaffold(false);
    const s = readFileSync(join(targetDir, 'src/syntheticIntents.ts'), 'utf-8');
    // Canonical nested shape — Sprint 03 Plan 02's `Intent` type.
    expect(s).toContain('input: { token:');
    expect(s).toContain('outputs: [');
    expect(s).toContain('recipient: ctx.treasuryAddress');
    // Defensive: no legacy flat shape.
    expect(s).not.toMatch(/intent\.inputAmount\b/);
    expect(s).not.toMatch(/intent\.inputToken\b/);
    expect(s).not.toMatch(/intent\.outputToken\b/);
    expect(s).not.toMatch(/intent\.outputAmount\b/);
  });

  test('exports a factory + EventEmitter-style API', async () => {
    await scaffold(false);
    const s = readFileSync(join(targetDir, 'src/syntheticIntents.ts'), 'utf-8');
    expect(s).toContain('createSyntheticIntentGenerator');
    expect(s).toContain('EventEmitter');
    expect(s).toContain('start()');
    expect(s).toContain('stop()');
    expect(s).toContain('emitOnce');
  });

  test('uses keccak256 for orderHash + tx hash (structurally valid bytes)', async () => {
    await scaffold(false);
    const s = readFileSync(join(targetDir, 'src/syntheticIntents.ts'), 'utf-8');
    expect(s).toContain('keccak256');
    expect(s).toContain('orderHash');
    expect(s).toContain('rawOrder');
    expect(s).toContain('signature');
  });

  test('honest scope comment — synthetic intents are explicitly fake', async () => {
    await scaffold(false);
    const s = readFileSync(join(targetDir, 'src/syntheticIntents.ts'), 'utf-8');
    // Honest framing required: do NOT pretend these are real chain intents.
    expect(s.toLowerCase()).toMatch(/synthetic|placeholder|structurally|demo/);
  });
});

// === Code shape — dashboard SSE emitter ==================================

describe('treasury-rebalance — dashboardEmitter.ts', () => {
  test('exposes /events SSE + /health JSON endpoints', async () => {
    await scaffold(false);
    const d = readFileSync(join(targetDir, 'src/dashboardEmitter.ts'), 'utf-8');
    expect(d).toContain("from 'node:http'");
    expect(d).toContain("'/events'");
    expect(d).toContain("'/health'");
    expect(d).toContain('text/event-stream');
  });

  test('broadcasts `spread-captured` event with the documented payload shape', async () => {
    await scaffold(false);
    const d = readFileSync(join(targetDir, 'src/dashboardEmitter.ts'), 'utf-8');
    // SSE frame uses the SSE protocol's `event: NAME\ndata: JSON\n\n` form.
    expect(d).toContain('event: spread-captured');
    expect(d).toContain('SpreadCapturedPayload');
    // Documented payload fields.
    expect(d).toMatch(/txHash[:\s]/);
    expect(d).toMatch(/orderHash[:\s]/);
    expect(d).toMatch(/amountUSD[:\s]/);
    expect(d).toMatch(/totalUSD[:\s]/);
  });

  test('handles client disconnect via failed write — no infinite queue', async () => {
    await scaffold(false);
    const d = readFileSync(join(targetDir, 'src/dashboardEmitter.ts'), 'utf-8');
    // Backpressure pattern: try res.write, drop client on failure.
    expect(d).toMatch(/clients\.delete\(/);
  });
});

// === Code shape — filler with DEMO_MODE branch ===========================

describe('treasury-rebalance — filler.ts (DEMO/production branch)', () => {
  test('imports BOTH createFillerFromPrivateKey + createMockFiller', async () => {
    await scaffold(false);
    const f = readFileSync(join(targetDir, 'src/filler.ts'), 'utf-8');
    // Production path.
    expect(f).toContain('createFillerFromPrivateKey');
    // Demo path — the exact import the synthetic generator can't trigger
    // through a real Reactor.
    expect(f).toContain("from '@filler-sdk/sdk/testing'");
    expect(f).toContain('createMockFiller');
    expect(f).toContain('mockFillResult');
  });

  test('branches on treasury.DEMO_MODE — wires synthetic generator OR subscribeIntents', async () => {
    await scaffold(false);
    const f = readFileSync(join(targetDir, 'src/filler.ts'), 'utf-8');
    expect(f).toContain('treasury.DEMO_MODE');
    expect(f).toContain('createSyntheticIntentGenerator');
    expect(f).toContain('subscribeIntents');
  });

  test('wires DashboardEmitter on the configured DASHBOARD_PORT', async () => {
    await scaffold(false);
    const f = readFileSync(join(targetDir, 'src/filler.ts'), 'utf-8');
    expect(f).toContain('createDashboardEmitter');
    expect(f).toContain('treasury.DASHBOARD_PORT');
    expect(f).toContain('emitSpreadCaptured');
    expect(f).toContain('dashboard.start()');
  });

  test('DEMO mode synthesises a realistic spread (5–30 bps of input)', async () => {
    await scaffold(false);
    const f = readFileSync(join(targetDir, 'src/filler.ts'), 'utf-8');
    expect(f).toContain('estimateSyntheticSpread');
    // 5 + 0..24 = 5..29 bps. Implementation may use slightly different bands;
    // we only assert the bps-style construction is present.
    expect(f).toMatch(/10[_,]?000n|BPS|bps/i);
  });

  test('uses canonical SDK API — prepareFill + submitFill (Sprint 03 names)', async () => {
    await scaffold(false);
    const f = readFileSync(join(targetDir, 'src/filler.ts'), 'utf-8');
    expect(f).toContain('await filler.prepareFill(intent)');
    expect(f).toContain('filler.submitFill(intent, params');
    // feeCapturedAmount NOT feesCaptured (Sprint 03 P09 final shape).
    expect(f).toContain('feeCapturedAmount');
    expect(f).not.toMatch(/result\.feesCaptured\b/);
  });

  test('graceful shutdown unwires generator + dashboard + subscription', async () => {
    await scaffold(false);
    const f = readFileSync(join(targetDir, 'src/filler.ts'), 'utf-8');
    expect(f).toContain('SIGTERM');
    expect(f).toContain('SIGINT');
    expect(f).toContain('await dashboard.stop');
    expect(f).toContain('filler.shutdown');
  });

  test('useKeeperHub=true threads keeperHub config + flag through', async () => {
    await scaffold(true);
    const f = readFileSync(join(targetDir, 'src/filler.ts'), 'utf-8');
    expect(f).toContain('keeperHub');
    expect(f).toContain('KEEPERHUB_API_KEY');
    expect(f).toContain('useKeeperHub: true');
  });

  test('useKeeperHub=false strips KH wiring', async () => {
    await scaffold(false);
    const f = readFileSync(join(targetDir, 'src/filler.ts'), 'utf-8');
    expect(f).not.toContain('KEEPERHUB_API_KEY');
    expect(f).not.toContain('useKeeperHub: true');
  });
});

// === Code shape — stake.ts ===============================================

describe('treasury-rebalance — stake.ts', () => {
  test('warns + exits early when DEMO_MODE=true (no bond needed in demo)', async () => {
    await scaffold(false);
    const s = readFileSync(join(targetDir, 'src/stake.ts'), 'utf-8');
    expect(s).toContain('treasury.DEMO_MODE');
    expect(s).toMatch(/no-op|process\.exit\(0\)/i);
  });

  test('uses scoped bond.stake(amount) — not bond.stake(filler, amount)', async () => {
    await scaffold(false);
    const s = readFileSync(join(targetDir, 'src/stake.ts'), 'utf-8');
    expect(s).toContain('filler.bond.stake(stakeAmountWei)');
    expect(s).not.toMatch(/bond\.stake\([^)]*FILLER_ADDRESS/);
  });
});

// === Code shape — treasury config ========================================

describe('treasury-rebalance — treasury.ts (Zod DAO config)', () => {
  test('exports TreasuryConfig + loadTreasuryConfig', async () => {
    await scaffold(false);
    const t = readFileSync(join(targetDir, 'src/treasury.ts'), 'utf-8');
    expect(t).toContain('export type TreasuryConfig');
    expect(t).toContain('export function loadTreasuryConfig');
  });

  test('validates TARGET_ALLOCATIONS sums to 100 and TOKEN_ADDRESSES are 0x-hex', async () => {
    await scaffold(false);
    const t = readFileSync(join(targetDir, 'src/treasury.ts'), 'utf-8');
    expect(t).toContain('TARGET_ALLOCATIONS');
    expect(t).toContain('sum to 100');
    expect(t).toContain('TOKEN_ADDRESSES');
    // 0x-prefixed 20-byte hex regex.
    expect(t).toMatch(/0x\[a-fA-F0-9\]\{40\}/);
  });

  test('schedule enum + DEMO knobs + DASHBOARD_PORT defaults are in place', async () => {
    await scaffold(false);
    const t = readFileSync(join(targetDir, 'src/treasury.ts'), 'utf-8');
    expect(t).toContain("'weekly', 'monthly', 'quarterly'");
    expect(t).toContain('DEMO_MODE');
    expect(t).toContain('DEMO_INTERVAL_SEC');
    expect(t).toContain('DASHBOARD_PORT');
    expect(t).toContain('MIN_REBALANCE_USD');
  });
});

// === SDK API alignment (catches drift) ===================================

describe('treasury-rebalance — SDK API alignment (defensive grep)', () => {
  test('uses canonical SDK exports + nested Intent shape', async () => {
    await scaffold(true);
    const allSrc = [
      'treasury.ts',
      'config.ts',
      'strategy.ts',
      'syntheticIntents.ts',
      'dashboardEmitter.ts',
      'filler.ts',
      'stake.ts',
    ]
      .map((f) => readFileSync(join(targetDir, 'src', f), 'utf-8'))
      .join('\n');
    expect(allSrc).toContain('createFillerFromPrivateKey');
    expect(allSrc).toContain('createDefaultLogger');
    expect(allSrc).toContain('feeCapturedAmount');
    // Defensive: legacy / wrong shapes.
    expect(allSrc).not.toMatch(/intent\.inputAmount\b/);
    expect(allSrc).not.toMatch(/intent\.outputAmount\b/);
    expect(allSrc).not.toMatch(/result\.feesCaptured\b/);
    // Wrong factory shape — `createFiller({ privateKey: ... })`. The right
    // path is either createFiller(BYO) or createFillerFromPrivateKey(opts).
    expect(allSrc).not.toMatch(/createFiller\(\{[^}]*privateKey/);
  });

  test('only filler.ts touches the Reactor / submitFill — strategy + treasury are pure', async () => {
    await scaffold(false);
    const files = ['strategy.ts', 'treasury.ts', 'syntheticIntents.ts', 'dashboardEmitter.ts'];
    for (const f of files) {
      const src = readFileSync(join(targetDir, 'src', f), 'utf-8');
      // No CALLS into the SDK runtime — they're allowed to *mention* names
      // in doc comments (helps maintainers), but nothing here should be
      // executing them. Imports from `@filler-sdk/sdk` are always type-only.
      const importLines = src
        .split('\n')
        .filter((line) => /^\s*import\b/.test(line))
        .filter((line) => /@filler-sdk\/sdk/.test(line));
      for (const line of importLines) {
        expect(line).toMatch(/^\s*import\s+type\b/);
      }
      expect(src).not.toMatch(/\bfiller\.submitFill\(/);
      expect(src).not.toMatch(/\.writeContract\(/);
    }
  });
});
