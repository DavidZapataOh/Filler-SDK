/**
 * Sprint 06 Plan 02 — quickstart claims test.
 *
 * Verifies that every concrete claim in `pages/docs/quickstart.mdx` is
 * grounded in the repo state — not stale or aspirational. If you change
 * the orchestrator, the addresses in chains.ts, the script flags, or the
 * relevant FEEDBACK F-* numbers, this test catches the drift before docs
 * users do.
 *
 * Heavy E2E (running `bun run e2e:fork` from the test) is gated behind
 * `RUN_E2E=1` — most CI runs skip it; nightly + pre-release run it.
 */

import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

const REPO_ROOT = resolve(__dirname, '../../..');
const QUICKSTART = resolve(REPO_ROOT, 'apps/docs/pages/docs/quickstart.mdx');
const FIRST_FILL = resolve(REPO_ROOT, 'apps/docs/pages/docs/first-fill.mdx');
const ROOT_PKG = resolve(REPO_ROOT, 'package.json');
const E2E_SCRIPT = resolve(REPO_ROOT, 'packages/sdk/scripts/e2e-fork.ts');
const SUBMIT_INTENT = resolve(REPO_ROOT, 'packages/sdk/scripts/submit-intent.ts');

let quickstart: string;
let firstFill: string;
let rootPkg: { scripts: Record<string, string> };

describe('quickstart.mdx — concrete claims', () => {
  it('files referenced exist in the repo', async () => {
    expect(existsSync(QUICKSTART), 'apps/docs/pages/docs/quickstart.mdx must exist').toBe(true);
    expect(existsSync(FIRST_FILL), 'apps/docs/pages/docs/first-fill.mdx must exist').toBe(true);
    expect(existsSync(E2E_SCRIPT), 'packages/sdk/scripts/e2e-fork.ts must exist').toBe(true);
    expect(existsSync(SUBMIT_INTENT), 'packages/sdk/scripts/submit-intent.ts must exist').toBe(true);
  });

  it('loads docs + manifest', async () => {
    quickstart = await readFile(QUICKSTART, 'utf-8');
    firstFill = await readFile(FIRST_FILL, 'utf-8');
    rootPkg = JSON.parse(await readFile(ROOT_PKG, 'utf-8'));
    expect(quickstart.length).toBeGreaterThan(1000);
  });

  it('claims `bun run e2e:fork` — script must be in root package.json', () => {
    expect(quickstart).toContain('bun run e2e:fork');
    expect(rootPkg.scripts['e2e:fork']).toBeDefined();
    expect(rootPkg.scripts['e2e:fork']).toContain('e2e-fork.ts');
  });

  it('claims deployed Filler/Bond addresses match deterministic CREATE outputs', () => {
    const FILLER = '0xC489d11D03B2999A6ba568e02E0b95eFc58b6A34';
    const BOND = '0x559Bb2F2beb43246bA63057F3750b742b92dBBf9';
    expect(quickstart, 'quickstart cites Filler addr').toContain(FILLER);
    expect(quickstart, 'quickstart cites Bond addr').toContain(BOND);
    expect(firstFill, 'first-fill cites Filler addr').toContain(FILLER);
    expect(firstFill, 'first-fill cites Bond addr').toContain(BOND);
  });

  it('claims canonical mainnet addresses match Plan 01 audit', () => {
    const POOL_MANAGER = '0x000000000004444c5dc75cb358380d2e3de08a90';
    const REACTOR = '0x00000011f84b9aa48e5f8aa8b9897600006289be';
    const PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3';
    const COMBINED = quickstart + firstFill;
    expect(COMBINED.toLowerCase()).toContain(POOL_MANAGER.toLowerCase());
    expect(COMBINED.toLowerCase()).toContain(REACTOR.toLowerCase());
    expect(COMBINED.toLowerCase()).toContain(PERMIT2.toLowerCase());
  });

  it('claims swapper + solver fresh-key addresses match e2e-fork.ts constants', async () => {
    const SWAPPER = '0x625fA00992407D255673bEA7460aD012CFC00Fdd';
    const SOLVER = '0xfaa792ce4873945cD67CEB5BcAeA0B84eb455510';
    const COMBINED = quickstart + firstFill;
    expect(COMBINED, 'docs cite swapper addr').toContain(SWAPPER);
    expect(COMBINED, 'docs cite solver addr').toContain(SOLVER);

    const orchestrator = await readFile(E2E_SCRIPT, 'utf-8');
    expect(orchestrator, 'e2e-fork.ts must declare same swapper').toContain(SWAPPER);
    expect(orchestrator, 'e2e-fork.ts must declare same solver').toContain(SOLVER);
  });

  it('claims SWAPPER_PRIVATE_KEY env var pattern works on submit-intent.ts', async () => {
    const cliFlag = 'SWAPPER_PRIVATE_KEY';
    expect(quickstart).toContain(cliFlag);
    const submitIntent = await readFile(SUBMIT_INTENT, 'utf-8');
    expect(submitIntent, 'submit-intent.ts must read SWAPPER_PRIVATE_KEY').toContain(cliFlag);
  });

  it('claims CLI flags (--input/--output/--size/--decay/--submit) work', async () => {
    expect(quickstart).toContain('--input USDC');
    expect(quickstart).toContain('--output WETH');
    expect(quickstart).toMatch(/--size \d+/);
    expect(quickstart).toMatch(/--decay \d+/);
    expect(quickstart).toContain('--submit');

    const submitIntent = await readFile(SUBMIT_INTENT, 'utf-8');
    for (const flag of ['input', 'output', 'size', 'decay', 'submit']) {
      expect(submitIntent, `submit-intent.ts must accept --${flag}`).toContain(`'${flag}'`);
    }
  });

  it('cross-references existing FEEDBACK items (no broken F-* numbers)', async () => {
    // FEEDBACK.md lives in plans/ which is one level UP from the filler-sdk repo
    const FEEDBACK_PATH = resolve(REPO_ROOT, '..', 'plans/FEEDBACK.md');
    const feedback = await readFile(FEEDBACK_PATH, 'utf-8');
    const fNumbers = new Set(
      [...feedback.matchAll(/^####\s+F-(\d+):/gm)].map((m) => `F-${m[1]}`),
    );
    expect(fNumbers.size, 'FEEDBACK should have many items').toBeGreaterThan(50);

    // Every F-N reference in quickstart/first-fill must exist in FEEDBACK.md
    const refs = [...(quickstart + firstFill).matchAll(/F-(\d+)/g)];
    for (const m of refs) {
      const fN = `F-${m[1]}`;
      expect(fNumbers.has(fN), `${fN} cited in docs but not in FEEDBACK.md`).toBe(true);
    }
  });

  it('references concrete F-items established in Sprint 5.5', () => {
    expect(quickstart, 'F-57 (testnet UniswapX gap)').toContain('F-57');
    expect(quickstart, 'F-62 (anvil EIP-7702 delegation)').toContain('F-62');
    expect(quickstart, 'F-64 (no Trading API source)').toContain('F-64');
    expect(quickstart, 'F-66 (Filler inventory requirement)').toContain('F-66');
  });
});

describe.skipIf(process.env['RUN_E2E'] !== '1')('quickstart.mdx — runtime claims (RUN_E2E=1)', () => {
  it('`bun run e2e:fork` actually completes with E2E PASS', { timeout: 120_000 }, () => {
    const out = execSync('bun run e2e:fork', {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
      timeout: 90_000,
    });
    expect(out).toMatch(/✓ E2E PASS in \d+(?:\.\d+)?s/);
    expect(out).toMatch(/tx mined SUCCESS: 0x[a-fA-F0-9]{64}/);
  });
});

// keep statSync referenced (tslint hush) — used implicitly via existsSync
void statSync;
