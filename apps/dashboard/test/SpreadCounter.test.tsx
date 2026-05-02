/**
 * SpreadCounter — Plan 03 live counter tests.
 *
 * Tests use a controlled async generator so we can step events one-at-a-time
 * (with `flushPromises` between) without relying on real wall-clock.
 *
 * Critical assertions:
 *
 *   - The component reads `totalUSD` from the event (server-authoritative
 *     cumulative), NOT `amountUSD` summed client-side. If a future
 *     contributor reverts to the plan-markdown sketch's `t + amountUSD`,
 *     the multi-event test fails. (See F-45.)
 *
 *   - Design-system locks: emerald for the per-fill delta + the glow,
 *     pure-white for the Big Number. NOT cyan.
 */

import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { SpreadCounter, type SpreadEvent } from '../src/components/SpreadCounter';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

/**
 * Push-based async iterable. Tests `await` between pushes so React state
 * settles before the next assertion. Closing the source ends iteration so
 * the component's `for-await` loop exits cleanly on unmount.
 */
function makePushSource(): {
  source: AsyncIterable<SpreadEvent>;
  push(event: SpreadEvent): Promise<void>;
  close(): void;
} {
  let resolveNext: ((value: IteratorResult<SpreadEvent>) => void) | null = null;
  const queue: SpreadEvent[] = [];
  let done = false;

  const iterator: AsyncIterator<SpreadEvent> = {
    next() {
      if (queue.length > 0) {
        return Promise.resolve({ value: queue.shift() as SpreadEvent, done: false });
      }
      if (done) {
        return Promise.resolve({ value: undefined as unknown as SpreadEvent, done: true });
      }
      return new Promise((resolve) => {
        resolveNext = resolve;
      });
    },
  };

  const source: AsyncIterable<SpreadEvent> = {
    [Symbol.asyncIterator]: () => iterator,
  };

  return {
    source,
    async push(event) {
      if (resolveNext !== null) {
        const r = resolveNext;
        resolveNext = null;
        r({ value: event, done: false });
      } else {
        queue.push(event);
      }
      // Yield so React can flush the state update.
      await Promise.resolve();
      await Promise.resolve();
    },
    close() {
      done = true;
      if (resolveNext !== null) {
        const r = resolveNext;
        resolveNext = null;
        r({ value: undefined as unknown as SpreadEvent, done: true });
      }
    },
  };
}

const TX_HASH_1 = `0x${'a'.repeat(64)}` as `0x${string}`;
const TX_HASH_2 = `0x${'b'.repeat(64)}` as `0x${string}`;
const ORDER_HASH = `0x${'1'.repeat(64)}` as `0x${string}`;

describe('SpreadCounter — empty / connecting state', () => {
  test('without a source, renders the empty state + $0', () => {
    render(<SpreadCounter />);
    // Big number text — wraps the count-up. CountUp formats Math.floor(0) as "0".
    expect(screen.getByTestId('spread-counter-amount')).toHaveTextContent('0');
    expect(screen.getByTestId('spread-counter-empty')).toHaveTextContent(
      /Waiting for the first fill/i,
    );
  });

  test('with an empty source (closes immediately), still renders the empty state', async () => {
    const { source, close } = makePushSource();
    render(<SpreadCounter source={source} />);
    close();
    expect(screen.getByTestId('spread-counter-empty')).toBeInTheDocument();
  });
});

describe('SpreadCounter — single event', () => {
  test('uses server `totalUSD` for the Big Number; shows tx + per-fill delta', async () => {
    const { source, push } = makePushSource();
    render(<SpreadCounter source={source} />);

    await act(async () => {
      await push({
        totalUSD: 1247.55,
        amountUSD: 1247.55,
        txHash: TX_HASH_1,
        orderHash: ORDER_HASH,
        timestamp: Date.now(),
      });
    });

    // Step the RAF queue so CountUp lands at the new target.
    await act(async () => {
      vi.advanceTimersByTime(400);
      vi.advanceTimersToNextFrame();
    });
    expect(screen.getByTestId('spread-counter-amount')).toHaveTextContent('1,247');
    expect(screen.getByTestId('spread-counter-delta')).toHaveTextContent('+$1,247.55');
    expect(screen.getByTestId('spread-counter-tx-link')).toHaveAttribute(
      'href',
      `https://uniscan.xyz/tx/${TX_HASH_1}`,
    );
    expect(screen.getByTestId('spread-counter-tx-link').textContent).toContain('0xaaaaaaaa');
  });
});

describe('SpreadCounter — multi-event reconnect-safe accumulation (F-45 lock)', () => {
  test('uses event.totalUSD verbatim — does NOT sum amountUSD client-side', async () => {
    const { source, push } = makePushSource();
    render(<SpreadCounter source={source} />);

    // First fill: server says cumulative=$500, this fill=$500.
    await act(async () => {
      await push({
        totalUSD: 500,
        amountUSD: 500,
        txHash: TX_HASH_1,
        orderHash: ORDER_HASH,
        timestamp: Date.now(),
      });
    });

    // Simulated SSE reconnect: server replays first event, then second.
    // If we client-side-summed amountUSD, we'd land on $1,500 ($500+$500+$500).
    // Server says cumulative is $750 — that's what we display.
    await act(async () => {
      await push({
        totalUSD: 500, // replayed
        amountUSD: 500,
        txHash: TX_HASH_1,
        orderHash: ORDER_HASH,
        timestamp: Date.now(),
      });
      await push({
        totalUSD: 750, // new fill: cumulative jumps from 500 → 750
        amountUSD: 250,
        txHash: TX_HASH_2,
        orderHash: ORDER_HASH,
        timestamp: Date.now(),
      });
    });

    // Step RAF queue so the count-up reaches its final target.
    await act(async () => {
      vi.advanceTimersByTime(400);
      vi.advanceTimersToNextFrame();
    });
    // Server-authoritative — NOT 1,500 (which would be the sum bug).
    expect(screen.getByTestId('spread-counter-amount')).toHaveTextContent('750');
    expect(screen.getByTestId('spread-counter-delta')).toHaveTextContent('+$250.00');
  });
});

describe('SpreadCounter — glow', () => {
  test('toggles data-glow=on for ~720ms after an event, then off', async () => {
    const { source, push } = makePushSource();
    render(<SpreadCounter source={source} />);

    expect(screen.getByTestId('spread-counter')).toHaveAttribute('data-glow', 'off');

    await act(async () => {
      await push({
        totalUSD: 100,
        amountUSD: 100,
        txHash: TX_HASH_1,
        orderHash: ORDER_HASH,
        timestamp: Date.now(),
      });
    });

    expect(screen.getByTestId('spread-counter')).toHaveAttribute('data-glow', 'on');

    await act(async () => {
      vi.advanceTimersByTime(800);
    });

    expect(screen.getByTestId('spread-counter')).toHaveAttribute('data-glow', 'off');
  });
});

describe('SpreadCounter — design system locks', () => {
  test('Big Number uses pure-white token (--color-text-primary), NOT cyan/emerald', () => {
    render(<SpreadCounter />);
    const amountEl = screen.getByTestId('spread-counter-amount');
    expect(amountEl.className).toContain('text-[--color-text-primary]');
    expect(amountEl.className).not.toContain('text-[--color-money]');
    expect(amountEl.className).not.toContain('text-[--color-live]');
  });

  test('per-fill delta uses --color-money (emerald), NOT cyan', async () => {
    const { source, push } = makePushSource();
    render(<SpreadCounter source={source} />);
    await act(async () => {
      await push({
        totalUSD: 42,
        amountUSD: 42,
        txHash: TX_HASH_1,
        orderHash: ORDER_HASH,
        timestamp: Date.now(),
      });
    });
    const delta = screen.getByTestId('spread-counter-delta');
    expect(delta.className).toContain('text-[--color-money]');
    expect(delta.className).not.toContain('text-[--color-live]');
    expect(delta.className).not.toContain('cyan');
  });

  test('no cyan classes anywhere in the rendered output', async () => {
    const { source, push } = makePushSource();
    const { container } = render(<SpreadCounter source={source} />);
    await act(async () => {
      await push({
        totalUSD: 1,
        amountUSD: 1,
        txHash: TX_HASH_1,
        orderHash: ORDER_HASH,
        timestamp: Date.now(),
      });
    });
    expect(container.innerHTML).not.toMatch(/\bcyan-\d/);
    expect(container.innerHTML).not.toContain('--color-live');
  });
});

describe('SpreadCounter — explorer link', () => {
  test('honors a custom explorerBaseUrl', async () => {
    const { source, push } = makePushSource();
    render(<SpreadCounter source={source} explorerBaseUrl="https://etherscan.io/tx" />);
    await act(async () => {
      await push({
        totalUSD: 1,
        amountUSD: 1,
        txHash: TX_HASH_1,
        orderHash: ORDER_HASH,
        timestamp: Date.now(),
      });
    });
    const link = screen.getByTestId('spread-counter-tx-link');
    expect(link).toHaveAttribute('href', `https://etherscan.io/tx/${TX_HASH_1}`);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });
});
