/**
 * JITDepthChart — Plan 04 structural + design-system tests.
 *
 * jsdom + recharts: ResponsiveContainer measures the parent's width via
 * ResizeObserver, which jsdom doesn't ship. We stub it (constant-size)
 * so the chart renders deterministically. Without the stub, recharts
 * silently renders zero-width SVG with no <path>s, and assertions on the
 * inner DOM fail.
 *
 * Critical assertions:
 *   - Skeleton on no source / pre-data.
 *   - On a snapshot, chart renders with the expected aria-label summary.
 *   - JIT range overlay uses emerald (`--color-money`), NOT amber.
 *   - No amber-as-JIT leak: the JIT highlight family sticks to emerald.
 */

import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

import { type DepthSnapshot, JITDepthChart } from '../src/components/JITDepthChart';

beforeAll(() => {
  // jsdom lacks ResizeObserver; recharts' ResponsiveContainer needs it.
  // Stubbing with a no-op observer + manually-fixed parent size is the
  // canonical recharts-test workaround.
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);

  // Force getBoundingClientRect to report a non-zero size for jsdom
  // elements — otherwise recharts renders a 0×0 SVG.
  const orig = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function fakeRect(): DOMRect {
    const rect = orig.call(this) as DOMRect;
    if (rect.width === 0 && rect.height === 0) {
      return {
        ...rect,
        width: 800,
        height: 280,
        top: 0,
        left: 0,
        right: 800,
        bottom: 280,
      } as DOMRect;
    }
    return rect;
  };
});

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/** Push-based async iterable (mirrors the SpreadCounter test helper). */
function makePushSource<T>(): {
  source: AsyncIterable<T>;
  push(item: T): Promise<void>;
  close(): void;
} {
  let resolveNext: ((value: IteratorResult<T>) => void) | null = null;
  const queue: T[] = [];
  let done = false;

  const iterator: AsyncIterator<T> = {
    next() {
      if (queue.length > 0) {
        return Promise.resolve({ value: queue.shift() as T, done: false });
      }
      if (done) {
        return Promise.resolve({ value: undefined as unknown as T, done: true });
      }
      return new Promise((resolve) => {
        resolveNext = resolve;
      });
    },
  };

  const source: AsyncIterable<T> = { [Symbol.asyncIterator]: () => iterator };

  return {
    source,
    async push(item) {
      if (resolveNext !== null) {
        const r = resolveNext;
        resolveNext = null;
        r({ value: item, done: false });
      } else {
        queue.push(item);
      }
      await Promise.resolve();
      await Promise.resolve();
    },
    close() {
      done = true;
      if (resolveNext !== null) {
        const r = resolveNext;
        resolveNext = null;
        r({ value: undefined as unknown as T, done: true });
      }
    },
  };
}

const SAMPLE_SNAPSHOT: DepthSnapshot = {
  ticks: Array.from({ length: 21 }, (_, i) => ({
    tick: 100_000 + (i - 10) * 60,
    liquidity: 1_000_000 + Math.abs(10 - i) * 50_000,
  })),
  currentTick: 100_000,
  jitRange: { tickLower: 99_900, tickUpper: 100_080 },
};

describe('JITDepthChart — empty / connecting state', () => {
  test('without a source, renders the skeleton', () => {
    render(<JITDepthChart pool="USDC/ETH 0.05%" />);
    expect(screen.getByTestId('jit-depth-skeleton')).toHaveTextContent(/Waiting for depth data/i);
    // Header is always present (chart card chrome).
    expect(screen.getByText(/JIT Depth/i)).toBeInTheDocument();
    expect(screen.getByText(/USDC\/ETH 0.05%/)).toBeInTheDocument();
  });

  test('with a source that hasn’t emitted yet, still skeleton', () => {
    const { source } = makePushSource<DepthSnapshot>();
    render(<JITDepthChart pool="USDC/ETH 0.05%" source={source} />);
    expect(screen.getByTestId('jit-depth-skeleton')).toBeInTheDocument();
  });
});

describe('JITDepthChart — single snapshot', () => {
  test('renders the chart figure + a screen-reader summary', async () => {
    const { source, push } = makePushSource<DepthSnapshot>();
    render(<JITDepthChart pool="USDC/ETH 0.05%" source={source} />);

    await act(async () => {
      await push(SAMPLE_SNAPSHOT);
    });

    const chart = screen.getByTestId('jit-depth-chart');
    expect(chart).toBeInTheDocument();
    expect(chart.getAttribute('aria-label')).toMatch(/Pool depth chart with 21 ticks/);
    expect(chart.getAttribute('aria-label')).toMatch(/current tick 100,000/);
    expect(chart.getAttribute('aria-label')).toMatch(/JIT add range from 99,900 to 100,080/);
  });

  test('JIT range caption is shown when jitRange is present', async () => {
    const { source, push } = makePushSource<DepthSnapshot>();
    render(<JITDepthChart pool="USDC/ETH 0.05%" source={source} />);

    await act(async () => {
      await push(SAMPLE_SNAPSHOT);
    });

    const caption = screen.getByTestId('jit-depth-caption');
    expect(caption).toHaveTextContent(/JIT add/i);
    expect(caption).toHaveTextContent(/99,900/);
    expect(caption).toHaveTextContent(/100,080/);
  });

  test('JIT range caption is hidden when jitRange is omitted', async () => {
    const { source, push } = makePushSource<DepthSnapshot>();
    render(<JITDepthChart pool="USDC/ETH 0.05%" source={source} />);

    // Omit jitRange entirely — under exactOptionalPropertyTypes, the
    // property must not be set to `undefined` explicitly.
    const noJit: DepthSnapshot = {
      ticks: SAMPLE_SNAPSHOT.ticks,
      currentTick: SAMPLE_SNAPSHOT.currentTick,
    };
    await act(async () => {
      await push(noJit);
    });

    expect(screen.queryByTestId('jit-depth-caption')).toBeNull();
  });
});

describe('JITDepthChart — multi-snapshot updates', () => {
  test('the chart re-renders to reflect each new snapshot', async () => {
    const { source, push } = makePushSource<DepthSnapshot>();
    render(<JITDepthChart pool="USDC/ETH 0.05%" source={source} />);

    await act(async () => {
      await push(SAMPLE_SNAPSHOT);
    });
    expect(screen.getByTestId('jit-depth-chart').getAttribute('aria-label')).toMatch(
      /current tick 100,000/,
    );

    // Push a new snapshot with a different current tick.
    const next: DepthSnapshot = {
      ticks: SAMPLE_SNAPSHOT.ticks,
      currentTick: 100_180,
    };
    await act(async () => {
      await push(next);
    });
    expect(screen.getByTestId('jit-depth-chart').getAttribute('aria-label')).toMatch(
      /current tick 100,180/,
    );
    // jitRange disappeared from the snapshot — caption should hide too.
    expect(screen.queryByTestId('jit-depth-caption')).toBeNull();
  });
});

describe('JITDepthChart — design system locks', () => {
  test('JIT caption uses --color-money (emerald), NOT amber', async () => {
    const { source, push } = makePushSource<DepthSnapshot>();
    render(<JITDepthChart pool="USDC/ETH 0.05%" source={source} />);
    await act(async () => {
      await push(SAMPLE_SNAPSHOT);
    });
    const caption = screen.getByTestId('jit-depth-caption');
    expect(caption.innerHTML).toContain('--color-money');
    expect(caption.innerHTML).not.toContain('amber-');
    expect(caption.innerHTML).not.toContain('--color-warn');
  });

  test('no amber-as-JIT leak anywhere in the rendered output', async () => {
    const { source, push } = makePushSource<DepthSnapshot>();
    const { container } = render(<JITDepthChart pool="USDC/ETH 0.05%" source={source} />);
    await act(async () => {
      await push(SAMPLE_SNAPSHOT);
    });
    // Defensive: amber is reserved for warn/degraded status. JIT highlights
    // belong to the money color family.
    expect(container.innerHTML).not.toMatch(/\bamber-\d/);
    expect(container.innerHTML).not.toContain('#fbbf24');
  });
});
