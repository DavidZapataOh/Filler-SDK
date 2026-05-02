import { describe, expect, test, vi } from 'vitest';

import {
  InvalidChainError,
  InvalidProjectNameError,
  InvalidVerticalError,
  type ParsedCliArgs,
  type PromptDriver,
  parseCliArgs,
  resolveConfig,
} from '../src/cli';

describe('parseCliArgs', () => {
  test('parses positional project name + flags', () => {
    const args = parseCliArgs([
      'my-solver',
      '--vertical',
      'simple-jit',
      '--chain',
      'unichain',
      '--indexer',
      'http://127.0.0.1:42069',
      '--keeperhub',
      '--no-git',
      '--no-install',
    ]);
    expect(args.projectName).toBe('my-solver');
    expect(args.vertical).toBe('simple-jit');
    expect(args.chain).toBe('unichain');
    expect(args.indexerUrl).toBe('http://127.0.0.1:42069');
    expect(args.keeperHub).toBe(true);
    expect(args.noGit).toBe(true);
    expect(args.noInstall).toBe(true);
  });

  test('falls back to defaults when flags absent', () => {
    const args = parseCliArgs([]);
    expect(args.projectName).toBeUndefined();
    expect(args.vertical).toBeUndefined();
    expect(args.chain).toBeUndefined();
    expect(args.indexerUrl).toBe('http://localhost:42069');
    expect(args.keeperHub).toBe(false);
    expect(args.noGit).toBe(false);
    expect(args.noInstall).toBe(false);
  });

  test('short flags work', () => {
    const args = parseCliArgs([
      'p',
      '-v',
      'custom',
      '-c',
      'foundry',
      '-k',
    ]);
    expect(args.vertical).toBe('custom');
    expect(args.chain).toBe('foundry');
    expect(args.keeperHub).toBe(true);
  });
});

// === resolveConfig (driver-injected) ====================================

interface ScriptedResponse {
  text?: string | symbol;
  select?: string | symbol;
  confirm?: boolean | symbol;
}

function makeDriver(scripted: ScriptedResponse[]): PromptDriver {
  let i = 0;
  return {
    text: vi.fn(async () => {
      const r = scripted[i++]?.text;
      if (r === undefined) throw new Error('text driver: no scripted response');
      return r;
    }),
    select: vi.fn(async () => {
      const r = scripted[i++]?.select;
      if (r === undefined) throw new Error('select driver: no scripted response');
      return r as never;
    }),
    confirm: vi.fn(async () => {
      const r = scripted[i++]?.confirm;
      if (r === undefined) throw new Error('confirm driver: no scripted response');
      return r;
    }),
  };
}

const baseArgs = (): ParsedCliArgs => ({
  projectName: undefined,
  vertical: undefined,
  chain: undefined,
  indexerUrl: 'http://localhost:42069',
  keeperHub: false,
  noGit: false,
  noInstall: false,
});

describe('resolveConfig — non-interactive (all flags supplied)', () => {
  test('returns CliConfig without invoking driver', async () => {
    const driver = makeDriver([]);
    const r = await resolveConfig(
      {
        ...baseArgs(),
        projectName: 'solver-a',
        vertical: 'simple-jit',
        chain: 'unichain',
        indexerUrl: 'https://hints.filler.xyz',
        keeperHub: true,
        noGit: true,
        noInstall: true,
      },
      driver,
    );
    if (typeof r === 'symbol') throw new Error('cancelled');
    expect(r.projectName).toBe('solver-a');
    expect(r.useKeeperHub).toBe(true);
    expect(r.initGit).toBe(false);
    expect(r.install).toBe(false);
  });

  test('rejects invalid project name', async () => {
    await expect(
      resolveConfig(
        {
          ...baseArgs(),
          projectName: 'BAD NAME',
          vertical: 'simple-jit',
          chain: 'unichain',
          indexerUrl: 'http://localhost:42069',
          keeperHub: false,
          noGit: true,
          noInstall: true,
        },
        makeDriver([]),
      ),
    ).rejects.toBeInstanceOf(InvalidProjectNameError);
  });

  test('rejects unknown vertical', async () => {
    await expect(
      resolveConfig(
        {
          ...baseArgs(),
          projectName: 'solver',
          vertical: 'mystery',
          chain: 'unichain',
          indexerUrl: 'http://localhost:42069',
          keeperHub: false,
          noGit: true,
          noInstall: true,
        },
        makeDriver([]),
      ),
    ).rejects.toBeInstanceOf(InvalidVerticalError);
  });

  test('rejects unknown chain', async () => {
    await expect(
      resolveConfig(
        {
          ...baseArgs(),
          projectName: 'solver',
          vertical: 'simple-jit',
          chain: 'mystery',
          indexerUrl: 'http://localhost:42069',
          keeperHub: false,
          noGit: true,
          noInstall: true,
        },
        makeDriver([]),
      ),
    ).rejects.toBeInstanceOf(InvalidChainError);
  });
});

describe('resolveConfig — interactive (driver-driven)', () => {
  test('drives every prompt when nothing is pre-supplied', async () => {
    const driver = makeDriver([
      { text: 'my-interactive-solver' },
      { select: 'simple-jit' },
      { select: 'unichain' },
      { text: 'http://localhost:42069' },
      { confirm: false }, // useKeeperHub
      { confirm: true }, // initGit
    ]);
    const r = await resolveConfig(baseArgs(), driver);
    if (typeof r === 'symbol') throw new Error('cancelled');
    expect(r.projectName).toBe('my-interactive-solver');
    expect(r.vertical).toBe('simple-jit');
    expect(r.chain).toBe('unichain');
    expect(r.useKeeperHub).toBe(false);
    expect(r.initGit).toBe(true);
  });

  test('returns Symbol on first cancel (project name)', async () => {
    const driver = makeDriver([{ text: Symbol.for('clack:cancel') }]);
    const r = await resolveConfig(baseArgs(), driver);
    expect(typeof r).toBe('symbol');
  });

  test('returns Symbol on cancel mid-flow (chain prompt)', async () => {
    const driver = makeDriver([
      { text: 'my-solver' },
      { select: 'simple-jit' },
      { select: Symbol.for('clack:cancel') },
    ]);
    const r = await resolveConfig(baseArgs(), driver);
    expect(typeof r).toBe('symbol');
  });

  test('skips git prompt when --no-git was passed', async () => {
    const driver = makeDriver([
      { text: 'my-solver' },
      { select: 'simple-jit' },
      { select: 'unichain' },
      { text: 'http://localhost:42069' },
      { confirm: false }, // useKeeperHub
      // NO confirm for git — --no-git skips that prompt.
    ]);
    const r = await resolveConfig({ ...baseArgs(), noGit: true }, driver);
    if (typeof r === 'symbol') throw new Error('cancelled');
    expect(r.initGit).toBe(false);
  });
});
