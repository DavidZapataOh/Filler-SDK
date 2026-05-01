/**
 * Sentry integration scaffold.
 *
 * `@sentry/node` is NOT a dependency of this package — pulling it in adds
 * ~150 KB plus a peer-dep tree that's irrelevant unless you're shipping to
 * production with a Sentry project. Instead, this module provides:
 *
 *   - A `SentryHooks` interface that captures the surface we use.
 *   - A `noopSentryHooks` default for development.
 *   - An `initSentry(opts)` factory that detects whether `@sentry/node` is
 *     installed AND `SENTRY_DSN` is set; only then does it dynamically import
 *     and initialise. Otherwise returns the no-op.
 *
 * To activate in production:
 *
 *     bun add @sentry/node
 *     SENTRY_DSN=https://... bun run start
 *
 * The dynamic import keeps the module tree-shake-friendly and the test
 * runtime free of @sentry/node entirely.
 */

export interface SentryHooks {
  captureException(err: unknown, context?: Record<string, unknown>): void;
  captureMessage(message: string, level?: 'info' | 'warning' | 'error'): void;
  /** Closes connections + flushes pending events. Called from SIGTERM. */
  shutdown(timeoutMs?: number): Promise<void>;
}

export const noopSentryHooks: SentryHooks = {
  captureException() {},
  captureMessage() {},
  async shutdown() {},
};

export interface InitSentryOptions {
  /** DSN. Pass `process.env.SENTRY_DSN ?? ''` to no-op when unset. */
  dsn: string;
  /** `production` | `staging` | `development`. */
  environment?: string;
  /** App version reported to Sentry. */
  release?: string;
  /** Trace sampling rate (0..1). */
  tracesSampleRate?: number;
}

/**
 * Initialise Sentry if a DSN is present AND `@sentry/node` is installed.
 * Otherwise, return the no-op hooks unchanged. Never throws.
 */
export async function initSentry(opts: InitSentryOptions): Promise<SentryHooks> {
  if (!opts.dsn || opts.dsn.length === 0) return noopSentryHooks;

  // Dynamic import via a string variable hides the module specifier from
  // TypeScript's resolver — `@sentry/node` is intentionally NOT in our
  // `dependencies`, so a static `import` would always fail to type-check
  // until an operator activates the integration.
  type SentryModule = {
    init(o: Record<string, unknown>): void;
    captureException(e: unknown, c?: { extra?: Record<string, unknown> }): void;
    captureMessage(m: string, l?: string): void;
    close(timeout?: number): Promise<boolean>;
  };
  const moduleName = '@sentry/node';
  let sentry: SentryModule;
  try {
    sentry = (await import(moduleName)) as unknown as SentryModule;
  } catch {
    // Package not installed — silent fallback to no-op.
    return noopSentryHooks;
  }

  sentry.init({
    dsn: opts.dsn,
    environment: opts.environment ?? 'development',
    release: opts.release,
    tracesSampleRate: opts.tracesSampleRate ?? 0.1,
  });

  return {
    captureException(err, context) {
      sentry.captureException(err, context === undefined ? undefined : { extra: context });
    },
    captureMessage(message, level = 'info') {
      sentry.captureMessage(message, level);
    },
    async shutdown(timeoutMs = 2_000) {
      await sentry.close(timeoutMs);
    },
  };
}
