/**
 * `create-filler` — main entry. Run via `npx create-filler [project-name]`.
 *
 * Lifecycle:
 *
 *   1. Argument parsing (commander) — surfaces `--help`, validates flag
 *      types, falls through to interactive prompts for missing fields.
 *   2. Interactive prompts (@clack/prompts) — only fired when the user didn't
 *      provide the corresponding flag. Cancellation via Ctrl-C exits cleanly.
 *   3. Validation — every input passes through `CliConfigSchema` before we
 *      touch the filesystem.
 *   4. Refuse overwrite — if the target dir exists, exit 1 with a clear
 *      message (no `--force` flag in v0; users move the dir or pick a new name).
 *   5. Scaffold — `scaffoldProject` writes files (Plan 01 stub; Plan 02
 *      template engine).
 *   6. Optional `bun install` (`--no-install` to skip).
 *   7. Optional `git init` (`--no-git` to skip).
 *   8. `outro` with next-step guidance.
 *
 * **Testability**: argument parsing + config-resolution logic is split out
 * into `parseCliArgs(...)` + `resolveConfig(...)` so `test/cli.test.ts`
 * exercises them in-process, without spawning a subprocess for every assertion.
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  cancel as clackCancel,
  confirm,
  intro,
  isCancel,
  outro,
  select,
  spinner,
  text,
} from '@clack/prompts';
import { Command } from 'commander';
import pc from 'picocolors';

import { scaffoldProject } from './scaffold';
import { CommandFailedError, runCommand } from './shell';
import {
  CHAINS,
  type CliConfig,
  CliConfigSchema,
  DEFAULT_INDEXER_URL,
  ProjectNameSchema,
  VERTICALS,
  isChainName,
  isVerticalKey,
} from './validation';
import type { ChainName } from './types';
import type { VerticalKey } from './validation';

export const CLI_VERSION = '0.0.0' as const;

// === CLI args (commander parse) ==========================================

export interface ParsedCliArgs {
  projectName: string | undefined;
  vertical: string | undefined;
  chain: string | undefined;
  indexerUrl: string;
  keeperHub: boolean;
  noGit: boolean;
  noInstall: boolean;
}

export function parseCliArgs(argv: readonly string[]): ParsedCliArgs {
  const program = new Command()
    .name('create-filler')
    .description('Scaffold a Filler SDK solver in seconds.')
    .argument('[project-name]', 'Project directory name')
    .option(
      '-v, --vertical <type>',
      `Vertical: ${VERTICALS.map((v) => v.value).join(', ')}`,
    )
    .option(
      '-c, --chain <chain>',
      `Chain: ${CHAINS.map((c) => c.value).join(', ')}`,
    )
    .option('-i, --indexer <url>', 'Indexer URL', DEFAULT_INDEXER_URL)
    .option('-k, --keeperhub', 'Enable KeeperHub MEV-protected routing', false)
    .option('--no-git', 'Skip `git init`')
    .option('--no-install', 'Skip `bun install`')
    .helpOption('-h, --help', 'Show usage');

  // Parse without auto-exit on `--help` so callers can decide.
  program.exitOverride();

  const parsed = program.parse([...argv], { from: 'user' });
  const opts = parsed.opts<{
    vertical?: string;
    chain?: string;
    indexer: string;
    keeperhub: boolean;
    git: boolean;
    install: boolean;
  }>();
  const positional = parsed.processedArgs[0];
  return {
    projectName: typeof positional === 'string' ? positional : undefined,
    vertical: opts.vertical,
    chain: opts.chain,
    indexerUrl: opts.indexer,
    keeperHub: opts.keeperhub,
    // commander represents `--no-X` as `opts.x === false`; we store as `noX`.
    noGit: opts.git === false,
    noInstall: opts.install === false,
  };
}

// === Resolve config (interactive + non-interactive paths) ================

export interface PromptDriver {
  text(args: {
    message: string;
    placeholder?: string;
    initialValue?: string;
    validate?: (val: string) => string | undefined;
  }): Promise<string | symbol>;
  select<T extends string>(args: {
    message: string;
    options: readonly { value: T; label: string; hint?: string }[];
  }): Promise<T | symbol>;
  confirm(args: {
    message: string;
    initialValue?: boolean;
  }): Promise<boolean | symbol>;
}

const clackDriver: PromptDriver = {
  text: (args) => text(args),
  select: <T extends string>(args: {
    message: string;
    options: readonly { value: T; label: string; hint?: string }[];
  }) =>
    // @clack/prompts' `select` is parameterised over both options AND value;
    // our wrapper only cares about the value type. Cast through `unknown` so
    // the driver's contract is consistent across drivers (the test driver
    // just resolves to a fixed value).
    select(args as never) as Promise<T | symbol>,
  confirm: (args) => confirm(args),
};

/**
 * Drive the prompt flow + return a fully validated `CliConfig`. Pulls from
 * `args` first, falls through to `driver.*` for missing fields. Returns
 * a `Symbol` (the @clack/prompts cancel sentinel) if the user Ctrl-C'd.
 */
export async function resolveConfig(
  args: ParsedCliArgs,
  driver: PromptDriver = clackDriver,
): Promise<CliConfig | symbol> {
  // 1. Project name
  let projectName = args.projectName;
  if (projectName === undefined) {
    const r = await driver.text({
      message: 'Project name',
      placeholder: 'my-solver',
      validate: (val) => {
        const parsed = ProjectNameSchema.safeParse(val);
        if (parsed.success) return undefined;
        return parsed.error.issues[0]?.message ?? 'invalid';
      },
    });
    if (typeof r === 'symbol' || isCancel(r)) return r as symbol;
    projectName = r as string;
  } else {
    const parsed = ProjectNameSchema.safeParse(projectName);
    if (!parsed.success) {
      throw new InvalidProjectNameError(
        parsed.error.issues[0]?.message ?? 'invalid project name',
      );
    }
  }

  // 2. Vertical
  let vertical: VerticalKey;
  if (args.vertical !== undefined) {
    if (!isVerticalKey(args.vertical)) {
      throw new InvalidVerticalError(args.vertical);
    }
    vertical = args.vertical;
  } else {
    const r = await driver.select({
      message: 'Which Filler vertical?',
      options: VERTICALS.map((v) => ({
        value: v.value,
        label: v.available ? v.label : `${v.label} ${pc.dim('(coming soon)')}`,
        hint: v.hint,
      })),
    });
    if (typeof r === 'symbol' || isCancel(r)) return r as symbol;
    vertical = r as VerticalKey;
  }

  // 3. Chain
  let chain: ChainName;
  if (args.chain !== undefined) {
    if (!isChainName(args.chain)) {
      throw new InvalidChainError(args.chain);
    }
    chain = args.chain;
  } else {
    const r = await driver.select({
      message: 'Which chain?',
      options: CHAINS.map((c) => ({ value: c.value, label: c.label })),
    });
    if (typeof r === 'symbol' || isCancel(r)) return r as symbol;
    chain = r as ChainName;
  }

  // We consider the run "non-interactive" when the user supplied projectName
  // + vertical + chain via flags. In that mode we DON'T prompt for indexer /
  // KeeperHub / git — flag values (or sensible defaults) are taken as final.
  // This makes scripted invocations (CI, test fixtures, AI agents) work
  // without TTY hacks.
  const nonInteractive =
    args.projectName !== undefined &&
    args.vertical !== undefined &&
    args.chain !== undefined;

  // 4. Indexer URL — only prompt in interactive mode AND only if user didn't
  //    pass --indexer (the default sentinel). In non-interactive mode the
  //    default flows through unchanged.
  let indexerUrl = args.indexerUrl;
  if (!nonInteractive && indexerUrl === DEFAULT_INDEXER_URL) {
    const r = await driver.text({
      message: 'Indexer URL',
      placeholder: DEFAULT_INDEXER_URL,
      initialValue: indexerUrl,
    });
    if (typeof r === 'symbol' || isCancel(r)) return r as symbol;
    indexerUrl = r as string;
  }

  // 5. KeeperHub — flag wins; absent flag prompts ONLY in interactive mode.
  let useKeeperHub = args.keeperHub;
  if (!nonInteractive && !args.keeperHub) {
    const r = await driver.confirm({
      message: 'Use KeeperHub for MEV-protected fill routing?',
      initialValue: false,
    });
    if (typeof r === 'symbol' || isCancel(r)) return r as symbol;
    useKeeperHub = r as boolean;
  }

  // 6. Git — `--no-git` is opt-out; otherwise prompt in interactive mode
  //    with default `true`. In non-interactive mode the default is `true`
  //    unless --no-git overrides.
  let initGit = !args.noGit;
  if (!nonInteractive && !args.noGit) {
    const r = await driver.confirm({
      message: 'Initialize git repo?',
      initialValue: true,
    });
    if (typeof r === 'symbol' || isCancel(r)) return r as symbol;
    initGit = r as boolean;
  }

  // 7. Install — driven only by flag. We never prompt because the prompt
  //    would appear AFTER scaffold which is mid-spinner-flow; cleaner to
  //    let `--no-install` be opt-out.
  const install = !args.noInstall;

  // Final validation
  const result = CliConfigSchema.safeParse({
    projectName,
    vertical,
    chain,
    indexerUrl,
    useKeeperHub,
    initGit,
    install,
  });
  if (!result.success) {
    throw new InvalidCliConfigError(
      result.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; '),
    );
  }
  return result.data;
}

// === Errors ==============================================================

export class InvalidProjectNameError extends Error {
  override readonly name = 'InvalidProjectNameError';
}
export class InvalidVerticalError extends Error {
  override readonly name = 'InvalidVerticalError';
  constructor(value: string) {
    super(
      `unknown vertical "${value}"; valid: ${VERTICALS.map((v) => v.value).join(', ')}`,
    );
  }
}
export class InvalidChainError extends Error {
  override readonly name = 'InvalidChainError';
  constructor(value: string) {
    super(
      `unknown chain "${value}"; valid: ${CHAINS.map((c) => c.value).join(', ')}`,
    );
  }
}
export class InvalidCliConfigError extends Error {
  override readonly name = 'InvalidCliConfigError';
}
export class TargetDirExistsError extends Error {
  override readonly name = 'TargetDirExistsError';
  constructor(targetDir: string) {
    super(
      `directory ${targetDir} already exists. Remove it or pick a different name.`,
    );
  }
}

// === Main ===============================================================

export async function main(argv: readonly string[]): Promise<number> {
  intro(pc.bgCyan(pc.black(' create-filler ')));

  let args: ParsedCliArgs;
  try {
    args = parseCliArgs(argv);
  } catch (err) {
    // commander.exitOverride throws on `--help` / `--version` / parse errors.
    const e = err as { code?: string };
    if (e.code === 'commander.helpDisplayed' || e.code === 'commander.help') {
      return 0;
    }
    if (
      e.code === 'commander.version' ||
      e.code === 'commander.versionDisplayed'
    ) {
      return 0;
    }
    console.error(pc.red(`Argument error: ${(err as Error).message}`));
    return 2;
  }

  let config: CliConfig | symbol;
  try {
    config = await resolveConfig(args);
  } catch (err) {
    console.error(pc.red((err as Error).message));
    return 1;
  }
  if (typeof config === 'symbol') {
    clackCancel('Cancelled.');
    return 0;
  }

  // Refuse overwrite
  const targetDir = resolve(process.cwd(), config.projectName);
  if (existsSync(targetDir)) {
    console.error(pc.red(new TargetDirExistsError(targetDir).message));
    return 1;
  }

  // Scaffold
  const scaffoldSpinner = spinner();
  scaffoldSpinner.start('Scaffolding project files...');
  try {
    await scaffoldProject({
      targetDir,
      projectName: config.projectName,
      vertical: config.vertical,
      chain: config.chain,
      indexerUrl: config.indexerUrl,
      useKeeperHub: config.useKeeperHub,
      initGit: config.initGit,
    });
    scaffoldSpinner.stop(pc.green(`Scaffolded ${config.projectName}/`));
  } catch (err) {
    scaffoldSpinner.stop(pc.red('Scaffold failed'));
    console.error((err as Error).stack ?? (err as Error).message);
    return 1;
  }

  // git init
  if (config.initGit) {
    const gitSpinner = spinner();
    gitSpinner.start('Initializing git...');
    try {
      await runCommand('git', ['init', '--quiet'], { cwd: targetDir });
      gitSpinner.stop(pc.green('git initialized'));
    } catch (err) {
      // Don't fail the whole CLI for a git issue; warn + continue.
      gitSpinner.stop(
        pc.yellow(
          `git init failed (continuing): ${(err as Error).message.split('\n')[0]}`,
        ),
      );
    }
  }

  // bun install
  if (config.install) {
    const installSpinner = spinner();
    installSpinner.start('Running `bun install`...');
    try {
      await runCommand('bun', ['install'], { cwd: targetDir });
      installSpinner.stop(pc.green('Dependencies installed'));
    } catch (err) {
      const msg =
        err instanceof CommandFailedError
          ? `bun install exited ${err.exitCode ?? 'null'}`
          : (err as Error).message.split('\n')[0];
      installSpinner.stop(
        pc.yellow(`Install failed (run \`bun install\` manually): ${msg}`),
      );
    }
  }

  // Outro
  outro(
    [
      pc.green('Done.') + ' Next steps:',
      '',
      `  ${pc.cyan(`cd ${config.projectName}`)}`,
      `  ${pc.dim('# fill SOLVER_PRIVATE_KEY + RPC_URL in .env')}`,
      `  ${pc.cyan(config.install ? 'bun start' : 'bun install && bun start')}`,
      '',
      pc.dim('Documentation: https://filler-sdk-docs.vercel.app'),
      pc.dim('Tres archivos y un bond. ⚡'),
    ].join('\n'),
  );
  return 0;
}

// === Entrypoint guard ===================================================

// This file is the package's bin entry. Always run main on load —
// `npx`-installed binaries land in `node_modules/.bin/<name>` as symlinks,
// so `process.argv[1] !== fileURLToPath(import.meta.url)` and any
// "import.meta.url === argv[1]" guard would silently skip main(). The
// package has no library entry; importers use the source files directly
// in tests.
void (async () => {
  const code = await main(process.argv.slice(2));
  process.exit(code);
})();
