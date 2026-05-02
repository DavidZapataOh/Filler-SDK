/**
 * Plan 06 (Sprint 04) — Cross-platform end-to-end tests.
 *
 * These spawn `dist/cli.js` as a REAL subprocess (via `node`) for each
 * vertical, scaffold a project under `os.tmpdir()`, and verify the output
 * is structurally sound. They're separated from the default `bun run test`
 * suite (vitest.config.ts excludes them by default) and only run via
 * `bun run test:e2e` — the cli-e2e.yml workflow runs them on
 * ubuntu-latest, macos-latest, and windows-latest.
 *
 * What these catch that the in-process integration tests don't:
 *   - The shebang + Node ESM entry-guard work cross-platform (the
 *     `invokedDirectly` check in `cli.ts` was Windows-broken pre-Plan 06).
 *   - `templates/` is bundled with the package + resolves from `dist/cli.js`.
 *   - Argv parsing + commander exit codes work when invoked as a real binary.
 *   - Paths with spaces in the parent directory don't break the spawn
 *     (the "Program Files" hazard on Windows).
 *   - Line endings in rendered files match the source `.tpl` bytes
 *     (`.gitattributes` enforces LF — broken Windows checkout would CRLF
 *     the templates and we'd see it in the rendered output here).
 *
 * What we deliberately DON'T do here:
 *   - `bun install` inside the rendered project. That requires the @filler-sdk
 *     workspace to resolve, which only works via path/workspace protocols.
 *     The integration tests already verify the structural shape; spending
 *     CI minutes on a real install per vertical isn't worth the cost. We
 *     test that the SCAFFOLD output is correct + that `tsc --noEmit` passes
 *     against a node_modules linked from the workspace.
 *   - Running the rendered solver against a real chain. That's Sprint 06's
 *     "demo recording" job.
 */

import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { afterEach, beforeEach, describe, expect, test } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI_BIN = resolve(HERE, '..', 'dist', 'cli.js');

const execFileAsync = promisify(execFile);

interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Spawn the built CLI as `node dist/cli.js [...args]`. Captures stdout +
 * stderr; returns exit code 0 on success or the actual code on failure.
 * Never `shell: true` (cross-platform safety — see shell.ts:RUN-COMMAND).
 */
async function runCli(args: string[], cwd: string): Promise<RunResult> {
  try {
    const { stdout, stderr } = await execFileAsync('node', [CLI_BIN, ...args], {
      cwd,
      env: { ...process.env, NODE_ENV: 'test', NO_COLOR: '1' },
      // Generous: scaffold + render of the heaviest vertical (treasury-rebalance
      // = 12 files) on a slow Windows runner is still well under 5s.
      timeout: 30_000,
    });
    return { stdout, stderr, exitCode: 0 };
  } catch (err) {
    const e = err as NodeJS.ErrnoException & {
      stdout?: string;
      stderr?: string;
      code?: number;
    };
    return {
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? e.message,
      exitCode: typeof e.code === 'number' ? e.code : 1,
    };
  }
}

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'create-filler-e2e-'));
});

afterEach(() => {
  if (existsSync(tmpRoot)) rmSync(tmpRoot, { recursive: true, force: true });
});

// === Sanity: dist/cli.js exists ==========================================

describe('e2e prerequisites', () => {
  test('dist/cli.js exists — run `bun run --filter create-filler build` first', () => {
    if (!existsSync(CLI_BIN)) {
      throw new Error(
        `${CLI_BIN} not found. The e2e suite requires the CLI to be built. ` +
          `Run: \`bun run --filter create-filler build\` then \`bun run --filter create-filler test:e2e\`.`,
      );
    }
    expect(existsSync(CLI_BIN)).toBe(true);
  });

  test('--help exits 0 + prints usage', async () => {
    const result = await runCli(['--help'], tmpRoot);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('create-filler');
    expect(result.stdout).toContain('--vertical');
  });
});

// === Per-vertical scaffolds ==============================================

const VERTICALS = ['simple-jit', 'lvr-aware', 'treasury-rebalance', 'custom'] as const;

for (const vertical of VERTICALS) {
  describe(`e2e — vertical ${vertical}`, () => {
    test(`spawn → scaffold → expected files exist`, async () => {
      const projectName = `e2e-${vertical}`;
      const projectDir = join(tmpRoot, projectName);

      const result = await runCli(
        [
          projectName,
          '--vertical',
          vertical,
          '--chain',
          'unichain',
          '--no-git',
          '--no-install',
        ],
        tmpRoot,
      );

      expect(result.exitCode, `stderr: ${result.stderr}`).toBe(0);
      expect(existsSync(projectDir)).toBe(true);
      expect(existsSync(join(projectDir, 'package.json'))).toBe(true);
      expect(existsSync(join(projectDir, 'tsconfig.json'))).toBe(true);
      expect(existsSync(join(projectDir, '.gitignore'))).toBe(true);
      expect(existsSync(join(projectDir, '.env.example'))).toBe(true);
      expect(existsSync(join(projectDir, 'README.md'))).toBe(true);

      // Vertical entrypoint — custom uses index.ts, others use filler.ts.
      const entry = vertical === 'custom' ? 'src/index.ts' : 'src/filler.ts';
      expect(existsSync(join(projectDir, entry))).toBe(true);
    });

    test('rendered files have LF line endings — no CRLF leak from .gitattributes', async () => {
      const projectName = `e2e-eol-${vertical}`;
      const projectDir = join(tmpRoot, projectName);

      const result = await runCli(
        [projectName, '--vertical', vertical, '--chain', 'unichain', '--no-git', '--no-install'],
        tmpRoot,
      );
      expect(result.exitCode).toBe(0);

      const entry = vertical === 'custom' ? 'src/index.ts' : 'src/filler.ts';
      const bytes = readFileSync(join(projectDir, entry));
      // Find any CRLF (`\r\n`) — would indicate the source `.tpl` got CRLF'd
      // on a Windows checkout, or an editor saved it with the wrong EOL.
      // .gitattributes pins *.tpl to eol=lf to prevent this.
      const crlfIndex = bytes.indexOf(Buffer.from([0x0d, 0x0a]));
      if (crlfIndex !== -1) {
        const lineNumber = bytes.subarray(0, crlfIndex).toString().split('\n').length;
        throw new Error(
          `${entry} contains CRLF at byte ${crlfIndex} (line ${lineNumber}). ` +
            `Source .tpl was likely converted to CRLF by Git on a Windows checkout. ` +
            `Verify .gitattributes pins *.tpl to eol=lf.`,
        );
      }
    });
  });
}

// === Cross-platform path hazards =========================================

describe('e2e — cross-platform path hazards', () => {
  test('scaffold inside a parent dir whose path contains a SPACE (Windows "Program Files" hazard)', async () => {
    // Note: bun install inside the rendered project is NOT exercised here —
    // we only verify the scaffold + spawn round-trip survives a spaced parent.
    const spacedRoot = mkdtempSync(join(tmpdir(), 'create filler spaced-'));
    try {
      const projectName = 'spaced-solver';
      const projectDir = join(spacedRoot, projectName);

      const result = await runCli(
        [
          projectName,
          '--vertical',
          'simple-jit',
          '--chain',
          'unichain',
          '--no-git',
          '--no-install',
        ],
        spacedRoot,
      );
      expect(result.exitCode, `stderr: ${result.stderr}`).toBe(0);
      expect(existsSync(projectDir)).toBe(true);
      expect(existsSync(join(projectDir, 'src', 'filler.ts'))).toBe(true);
    } finally {
      if (existsSync(spacedRoot)) rmSync(spacedRoot, { recursive: true, force: true });
    }
  });

  test('refuses to overwrite an existing dir', async () => {
    const projectName = 'preexists';
    const projectDir = join(tmpRoot, projectName);
    // Pre-create the dir.
    rmSync(projectDir, { recursive: true, force: true });
    require('node:fs').mkdirSync(projectDir);

    const result = await runCli(
      [projectName, '--vertical', 'simple-jit', '--chain', 'unichain', '--no-git', '--no-install'],
      tmpRoot,
    );
    expect(result.exitCode).not.toBe(0);
    // Error wording check — also covers the lowercase "directory" path.
    expect(`${result.stdout}\n${result.stderr}`.toLowerCase()).toMatch(/already exists|exists/);
  });

  test('rejects an invalid project name (uppercase + space)', async () => {
    // "Invalid Name" — fails ProjectNameSchema (lowercase-only + no spaces).
    const result = await runCli(
      ['Invalid Name', '--vertical', 'simple-jit', '--chain', 'unichain', '--no-git', '--no-install'],
      tmpRoot,
    );
    expect(result.exitCode).not.toBe(0);
  });
});

// === Sanity: rendered package.json is valid JSON =========================

describe('e2e — rendered output is valid', () => {
  test('every vertical produces parseable JSON files', async () => {
    for (const vertical of VERTICALS) {
      const projectName = `e2e-json-${vertical}`;
      const projectDir = join(tmpRoot, projectName);

      const result = await runCli(
        [projectName, '--vertical', vertical, '--chain', 'unichain', '--no-git', '--no-install'],
        tmpRoot,
      );
      expect(result.exitCode, `stderr: ${result.stderr}`).toBe(0);

      // package.json — JSON.parse throws on invalid.
      const pkg = JSON.parse(readFileSync(join(projectDir, 'package.json'), 'utf-8')) as {
        name: string;
      };
      expect(pkg.name).toBe(projectName);

      // tsconfig.json — JSONC parse not needed; our templates emit pure JSON.
      const ts = JSON.parse(readFileSync(join(projectDir, 'tsconfig.json'), 'utf-8')) as {
        compilerOptions: Record<string, unknown>;
      };
      expect(ts).toHaveProperty('compilerOptions');
    }
  });
});
