import type { Context, MiddlewareHandler } from 'hono';

/**
 * Per-IP token-bucket rate limiter.
 *
 * - `rps`   target steady-state rate (tokens added per second).
 * - `burst` bucket capacity (max tokens an IP can hoard while idle).
 *
 * The bucket is refilled lazily on each request — no background ticker. A
 * sweep timer drops idle entries every minute to avoid an unbounded map under
 * sustained traffic from many distinct IPs.
 *
 * Returned middleware honours `X-Forwarded-For` and `X-Real-IP`. Behind a
 * trusted reverse proxy these are reliable; if you expose this directly to
 * the public internet, run it behind nginx / Cloudflare / similar that sets
 * the headers from the connection IP.
 */
export interface RateLimitOptions {
  rps: number;
  burst: number;
  /** Optional custom IP extractor. Defaults to header-based. */
  ipFor?: (c: Context) => string;
  /** Visible for tests — provides a deterministic clock. */
  now?: () => number;
}

interface Bucket {
  tokens: number;
  lastRefill: number;
}

export interface RateLimiter {
  middleware: MiddlewareHandler;
  /** Drop bucket entries idle for ≥ `idleMs`. Returns the number dropped. */
  prune(idleMs?: number): number;
  /** Current bucket count — testable. */
  size(): number;
}

const DEFAULT_IDLE_MS = 5 * 60_000;

export function createRateLimiter(opts: RateLimitOptions): RateLimiter {
  const buckets = new Map<string, Bucket>();
  const now = opts.now ?? (() => Date.now());
  const ipFor = opts.ipFor ?? defaultIpExtractor;

  const middleware: MiddlewareHandler = async (c, next) => {
    const ip = ipFor(c);
    const t = now();

    let bucket = buckets.get(ip);
    if (bucket === undefined) {
      bucket = { tokens: opts.burst, lastRefill: t };
      buckets.set(ip, bucket);
    } else {
      // Lazy refill: add `rps × elapsed_seconds` tokens, capped at `burst`.
      const elapsedSec = (t - bucket.lastRefill) / 1000;
      bucket.tokens = Math.min(opts.burst, bucket.tokens + elapsedSec * opts.rps);
      bucket.lastRefill = t;
    }

    if (bucket.tokens < 1) {
      const retryAfter = Math.max(1, Math.ceil((1 - bucket.tokens) / opts.rps));
      return c.json(
        { error: 'Rate limit exceeded' },
        429,
        { 'Retry-After': String(retryAfter) },
      );
    }

    bucket.tokens -= 1;
    await next();
    return;
  };

  return {
    middleware,
    prune(idleMs = DEFAULT_IDLE_MS) {
      const cutoff = now() - idleMs;
      let dropped = 0;
      for (const [ip, bucket] of buckets) {
        if (bucket.lastRefill < cutoff) {
          buckets.delete(ip);
          dropped += 1;
        }
      }
      return dropped;
    },
    size() {
      return buckets.size;
    },
  };
}

function defaultIpExtractor(c: Context): string {
  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  const real = c.req.header('x-real-ip');
  if (real) return real.trim();
  return 'unknown';
}
