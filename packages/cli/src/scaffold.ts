/**
 * `scaffoldProject` — file-system orchestration with real templates.
 *
 * Plan 02 swap from Plan 01's string-builder stub: now reads templates from
 * disk under `templates/_base/` (shared) + `templates/<vertical>/` (overlay)
 * and renders them through `render()` from `./render`. Atomic cleanup on
 * failure — but only nuke the dir if WE created it.
 *
 * Resolution: at dev time, `import.meta.url` points at
 * `packages/cli/src/scaffold.ts`; `../templates` resolves to
 * `packages/cli/templates/`. After tsup builds `dist/cli.js`, the same
 * relative path resolves to `packages/cli/templates/` — so the templates dir
 * is found whether the user runs `bun src/cli.ts` (dev) or
 * `node dist/cli.js` (prod).
 *
 * **Path traversal safety**: all destination paths flow through
 * `path.join(targetDir, …)` where the `…` parts come from `readdir` of files
 * we ship. The CLI's templates dir is part of the package; it's not user-
 * controlled. The only user-controlled component is `targetDir` itself,
 * which already exists+is checked for overwrite by the CLI before scaffold.
 */

import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { render, type TemplateValue } from './render';
import type { ChainName } from './types';
import type { VerticalKey } from './validation';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Resolves to `packages/cli/templates/` whether running from `src/` (dev) or
 * `dist/` (after build). Both layouts have a sibling `templates/` directory.
 */
const TEMPLATES_DIR = resolve(HERE, '..', 'templates');

const BASE_TEMPLATE = '_base';
const TPL_EXT = '.tpl';
/** Files prefixed with `_` get renamed to `.<rest>`. npm strips dotfiles
 *  from packed tarballs unless they're stored with this safe prefix. */
const DOTFILE_PREFIX = '_';

export interface ScaffoldOptions {
  /** Absolute path of the directory to create. Must NOT already exist. */
  targetDir: string;
  /** npm package name (also the directory basename). */
  projectName: string;
  /** Solver vertical — picks the template overlay. */
  vertical: VerticalKey;
  /** Chain to operate on. */
  chain: ChainName;
  /** Indexer base URL (jit-hints HTTP API). */
  indexerUrl: string;
  /** Whether to wire KeeperHub MEV-protected routing into the template. */
  useKeeperHub: boolean;
  /** Whether the CLI should `git init` after writing files (handled by caller). */
  initGit: boolean;
}

/**
 * Scaffold a project. Idempotent on partial-failure: if any step throws, the
 * target dir is removed (only if we created it; we never `rm -rf` a
 * pre-existing dir).
 */
export async function scaffoldProject(opts: ScaffoldOptions): Promise<void> {
  if (!existsSync(TEMPLATES_DIR)) {
    throw new Error(
      `templates directory not found: ${TEMPLATES_DIR}. Run \`bun run build\` first if shipping the CLI from a published package.`,
    );
  }

  const verticalDir = resolve(TEMPLATES_DIR, opts.vertical);
  if (!existsSync(verticalDir)) {
    throw new Error(
      `template not found for vertical "${opts.vertical}". Available: ${listKnownVerticals().join(', ')}`,
    );
  }

  // Track whether WE created the target dir. If the user pre-existed it (and
  // somehow slipped past the CLI's check — race condition) we must not nuke
  // their files on cleanup.
  const createdNew = !existsSync(opts.targetDir);

  const vars = buildTemplateVars(opts);

  try {
    await mkdir(opts.targetDir, { recursive: false });

    // Copy + render `_base/` first.
    await copyTree(resolve(TEMPLATES_DIR, BASE_TEMPLATE), opts.targetDir, vars);

    // Then overlay vertical-specific files (files with the same path
    // overwrite the base). Render also applied here.
    await copyTree(verticalDir, opts.targetDir, vars);
  } catch (err) {
    if (createdNew) {
      try {
        await rm(opts.targetDir, { recursive: true, force: true });
      } catch {
        // Cleanup failure is secondary — surface the original.
      }
    }
    throw err;
  }
}

// === Internals ============================================================

interface TemplateVars extends Record<string, TemplateValue> {
  projectName: string;
  vertical: string;
  chain: string;
  indexerUrl: string;
  rpcUrl: string;
  useKeeperHub: boolean;
  currentYear: number;
}

function buildTemplateVars(opts: ScaffoldOptions): TemplateVars {
  return {
    projectName: opts.projectName,
    vertical: opts.vertical,
    chain: opts.chain,
    indexerUrl: opts.indexerUrl,
    rpcUrl: getDefaultRpc(opts.chain),
    useKeeperHub: opts.useKeeperHub,
    currentYear: new Date().getFullYear(),
  };
}

async function copyTree(
  srcDir: string,
  destDir: string,
  vars: TemplateVars,
): Promise<void> {
  if (!existsSync(srcDir)) return; // overlay might be empty for a vertical

  const entries = await readdir(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = join(srcDir, entry.name);

    // Strip `.tpl` extension + rename `_<name>` → `.<name>`.
    let outName = entry.name;
    if (outName.endsWith(TPL_EXT)) {
      outName = outName.slice(0, -TPL_EXT.length);
    }
    if (outName.startsWith(DOTFILE_PREFIX)) {
      outName = '.' + outName.slice(DOTFILE_PREFIX.length);
    }

    const destPath = join(destDir, outName);

    if (entry.isDirectory()) {
      await mkdir(destPath, { recursive: true });
      await copyTree(srcPath, destPath, vars);
      continue;
    }

    if (entry.name.endsWith(TPL_EXT)) {
      // Render via the template engine.
      const content = await readFile(srcPath, 'utf-8');
      const rendered = render(content, vars);
      await writeFile(destPath, rendered, 'utf-8');
    } else {
      // Plain file — copy bytes as-is (preserves permissions on POSIX).
      await cp(srcPath, destPath);
    }
  }
}

// === Default RPC URLs (mirror jit-hints/env.ts canonical values) =========

/**
 * Public-node RPC URLs per chain. Mirrors `packages/jit-hints/src/env.ts`
 * defaults so the scaffold + indexer share a source of truth.
 *
 * For testnets / Foundry we point at the conventional defaults; users
 * typically override via `RPC_URL` in `.env`.
 */
export function getDefaultRpc(chain: ChainName): string {
  const RPCS: Readonly<Record<ChainName, string>> = {
    mainnet: 'https://eth.publicnode.com',
    unichain: 'https://unichain.publicnode.com',
    base: 'https://base.publicnode.com',
    arbitrum: 'https://arbitrum.publicnode.com',
    optimism: 'https://optimism.publicnode.com',
    sepolia: 'https://ethereum-sepolia.publicnode.com',
    unichainSepolia: 'https://sepolia.unichain.org',
    foundry: 'http://localhost:8545',
  };
  return RPCS[chain];
}

function listKnownVerticals(): readonly string[] {
  // We hardcode the four known verticals (matching `validation.ts:VERTICALS`)
  // for the error message. Drift between this list and the real templates
  // dir is caught by the integration tests.
  return ['simple-jit', 'lvr-aware', 'treasury-rebalance', 'custom'];
}
