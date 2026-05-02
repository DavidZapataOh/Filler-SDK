/**
 * `runCommand(cmd, args, opts)` — async wrapper around `child_process.spawn`.
 *
 * Captures stdout + stderr into strings (returned + included in error
 * messages). Honors AbortSignal so the CLI can interrupt long-running
 * installs cleanly. Cross-platform: `shell: false` so `args` is passed
 * exactly (no quoting surprises on Windows); the caller picks the right
 * executable name (`bun` vs `bun.exe` is handled by the OS PATH lookup).
 */

import { spawn } from 'node:child_process';

export interface RunCommandOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /** Cancel the command. The process is killed with SIGTERM. */
  signal?: AbortSignal;
  /** When true, stream output to the parent's stdio. Default false. */
  inherit?: boolean;
}

export interface RunCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export class CommandFailedError extends Error {
  override readonly name = 'CommandFailedError';
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  constructor(
    command: string,
    args: readonly string[],
    exitCode: number | null,
    stdout: string,
    stderr: string,
  ) {
    super(
      `${command} ${args.join(' ')} exited with ${exitCode ?? 'null'}\n${stderr}`,
    );
    this.exitCode = exitCode;
    this.stdout = stdout;
    this.stderr = stderr;
  }
}

export function runCommand(
  command: string,
  args: readonly string[],
  opts: RunCommandOptions = {},
): Promise<RunCommandResult> {
  return new Promise((resolve, reject) => {
    const stdio = opts.inherit === true ? 'inherit' : 'pipe';
    const spawnOpts: Parameters<typeof spawn>[2] = {
      stdio,
      shell: false,
    };
    if (opts.cwd !== undefined) spawnOpts.cwd = opts.cwd;
    if (opts.env !== undefined) spawnOpts.env = opts.env;
    if (opts.signal !== undefined) spawnOpts.signal = opts.signal;

    const proc = spawn(command, [...args], spawnOpts);

    let stdout = '';
    let stderr = '';
    if (opts.inherit !== true) {
      proc.stdout?.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      proc.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
    }

    proc.on('error', (err) => {
      reject(err);
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr, exitCode: 0 });
      } else {
        reject(new CommandFailedError(command, args, code, stdout, stderr));
      }
    });
  });
}
