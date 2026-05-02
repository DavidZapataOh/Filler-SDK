/**
 * `scaffoldProject` — file-system orchestration.
 *
 * **Plan 01 STUB**: creates the target directory + writes minimal placeholder
 * files (`package.json`, `README.md`, `.gitignore`, `.env.example`, a stub
 * `src/index.ts`) so the lifecycle works end-to-end and the test suite can
 * verify a real project directory was produced.
 *
 * **Plan 02** swaps the body for a real template engine that:
 *   - Reads from `templates/<vertical>/` (Handlebars or similar).
 *   - Substitutes project name, chain, addresses, KeeperHub config.
 *   - Renames `_gitignore` → `.gitignore`, `_env.example` → `.env.example`
 *     (npm strips dotfiles from packed tarballs unless renamed).
 *   - Validates the output project compiles (`bun install && bun run build`
 *     exit 0) — the Plan 01 §2 acceptance criterion.
 *
 * The `ScaffoldOptions` shape is locked in Plan 01 so Plan 02's swap is a
 * single-file change.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { ChainName } from './types';
import type { VerticalKey } from './validation';

export interface ScaffoldOptions {
  /** Absolute path of the directory to create. Must NOT already exist. */
  targetDir: string;
  /** npm package name (also the directory basename). */
  projectName: string;
  /** Solver vertical — picks the template variant. */
  vertical: VerticalKey;
  /** Chain to operate on. */
  chain: ChainName;
  /** Indexer base URL (jit-hints HTTP API). */
  indexerUrl: string;
  /** Whether to wire KeeperHub MEV-protected routing into the template. */
  useKeeperHub: boolean;
  /** Whether the CLI should `git init` after writing files. */
  initGit: boolean;
}

const STUB_NOTICE_BANNER = `// =============================================================================
//  PLACEHOLDER — Plan 01 of Sprint 04 ships the CLI scaffold lifecycle.
//  Plan 02 fills the templates with the real solver code.
// =============================================================================
`;

export async function scaffoldProject(opts: ScaffoldOptions): Promise<void> {
  await mkdir(opts.targetDir, { recursive: false });
  await mkdir(resolve(opts.targetDir, 'src'), { recursive: true });

  await writeFile(
    resolve(opts.targetDir, 'package.json'),
    renderStubPackageJson(opts) + '\n',
    'utf-8',
  );

  await writeFile(
    resolve(opts.targetDir, 'README.md'),
    renderStubReadme(opts),
    'utf-8',
  );

  await writeFile(
    resolve(opts.targetDir, '.gitignore'),
    renderStubGitignore(),
    'utf-8',
  );

  await writeFile(
    resolve(opts.targetDir, '.env.example'),
    renderStubEnvExample(opts),
    'utf-8',
  );

  await writeFile(
    resolve(opts.targetDir, 'src', 'index.ts'),
    renderStubIndexTs(opts),
    'utf-8',
  );
}

// === Renderers — plain string literals for Plan 01; Plan 02 swaps for
//                templating ============================================

function renderStubPackageJson(opts: ScaffoldOptions): string {
  const pkg = {
    name: opts.projectName,
    version: '0.0.0',
    description: `Filler SDK solver — ${opts.vertical} on ${opts.chain}`,
    license: 'MIT',
    type: 'module',
    scripts: {
      start: 'bun src/index.ts',
      dev: 'bun --hot src/index.ts',
      typecheck: 'tsc --noEmit',
    },
    dependencies: {
      '@filler-sdk/sdk': '^0.0.0',
      viem: '^2.21.0',
    },
    devDependencies: {
      '@types/node': '^25.0.0',
      typescript: '^5.6.0',
    },
    engines: { node: '>=20' },
  };
  return JSON.stringify(pkg, null, 2);
}

function renderStubReadme(opts: ScaffoldOptions): string {
  return `# ${opts.projectName}

Filler SDK solver — \`${opts.vertical}\` vertical on \`${opts.chain}\`.

> ${stubNotice('Plan 01 of Sprint 04 scaffolded this skeleton. Real solver code lands in Plan 02 templates.')}

## Quickstart

\`\`\`bash
cp .env.example .env
# Set SOLVER_PRIVATE_KEY and RPC_URL in .env
bun install
bun start
\`\`\`

## Configuration

| Variable | Description | Default |
|---|---|---|
| \`SOLVER_PRIVATE_KEY\` | 0x-prefixed 32-byte hex private key | (required) |
| \`RPC_URL\` | RPC endpoint for ${opts.chain} | (required) |
| \`INDEXER_URL\` | JIT-hints indexer base URL | \`${opts.indexerUrl}\` |
${opts.useKeeperHub ? `| \`KEEPERHUB_API_KEY\` | KeeperHub bearer token (MEV-protected routing) | (required) |\n` : ''}

## Documentation

- [Filler SDK docs](https://docs.filler-sdk.xyz) — Sprint 06 deliverable.
- [SDK reference](https://github.com/filler-sdk/filler-sdk/tree/main/packages/sdk) — auto-generated from JSDoc.
- [JIT-hints indexer](https://github.com/filler-sdk/filler-sdk/tree/main/packages/jit-hints) — self-host the indexer for private depth queries.

## License

MIT
`;
}

function renderStubGitignore(): string {
  return [
    'node_modules',
    'dist',
    '.env',
    '.env.local',
    '.env.*.local',
    '*.log',
    '.DS_Store',
    'coverage',
    '.turbo',
    '.cache',
    '',
  ].join('\n');
}

function renderStubEnvExample(opts: ScaffoldOptions): string {
  const lines = [
    '# Solver wallet — 0x-prefixed 32-byte hex private key.',
    '# Anvil burner key shown for reference; replace with your real key.',
    '#   anvil[0]: 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    'SOLVER_PRIVATE_KEY=',
    '',
    `# RPC endpoint for ${opts.chain}. Must be https:// (http:// only allowed for localhost).`,
    'RPC_URL=',
    '',
    `# JIT-hints indexer URL. Self-host via the @filler-sdk/jit-hints package.`,
    `INDEXER_URL=${opts.indexerUrl}`,
    '',
  ];
  if (opts.useKeeperHub) {
    lines.push(
      '# KeeperHub bearer token for MEV-protected fill routing.',
      '# Obtain from your KeeperHub dashboard at signup.',
      'KEEPERHUB_API_KEY=',
      'KEEPERHUB_BASE_URL=https://api.keeperhub.example.com',
      '',
    );
  }
  return lines.join('\n');
}

function renderStubIndexTs(opts: ScaffoldOptions): string {
  return `${STUB_NOTICE_BANNER}
// Solver entry point — real implementation lands in Plan 02 templates.
//
// Vertical:    ${opts.vertical}
// Chain:       ${opts.chain}
// KeeperHub:   ${opts.useKeeperHub ? 'enabled' : 'disabled'}
//
// Once Plan 02 ships the real templates, this file will:
//   1. Read SOLVER_PRIVATE_KEY + RPC_URL + INDEXER_URL from .env.
//   2. Build the Filler via createFillerFromPrivateKey().
//   3. Subscribe to UniswapX intents via filler.subscribeIntents.
//   4. Compute FillParams via filler.prepareFill.
//   5. Submit fills via filler.submitFill.

console.log('Hello from ${opts.projectName} — your solver scaffold is wired.');
console.log('See README.md for next steps.');
`;
}

function stubNotice(text: string): string {
  return `**Stub:** ${text}`;
}
