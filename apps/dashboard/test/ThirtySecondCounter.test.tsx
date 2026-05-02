/**
 * ThirtySecondCounter — Plan 02 timer + design-system locks.
 *
 * Uses vi.useFakeTimers() to advance the simulated 30-tick timer + the
 * 800ms count-up without burning real wall-clock.
 *
 * Design-system locks (these would fire if a future contributor reverts
 * to the plan markdown's cyan-as-money treatment):
 *   - Money number uses --color-money (emerald), NOT --color-live (cyan).
 *   - Timer number uses --color-live (cyan) — that one's the demo's
 *     status/speed signal.
 *   - "Done" badge uses emerald — single accent for completion.
 *   - The illustrative-amount disclaimer text is present.
 */

import { act, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import {
  ThirtySecondCounter,
  type ThirtySecondCounterHandle,
} from '../src/components/Hero/ThirtySecondCounter';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ThirtySecondCounter — timer logic', () => {
  test('starts at 00s when autoStart=false', () => {
    render(<ThirtySecondCounter autoStart={false} />);
    expect(screen.getByText('00s')).toBeInTheDocument();
    expect(screen.getByTestId('hero-30s-amount')).toHaveTextContent('0');
  });

  test('increments seconds at 100ms ticks (3s simulated wall-clock to reach 30s label)', () => {
    render(<ThirtySecondCounter />);
    expect(screen.getByText('00s')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(500); // 5 ticks
    });
    expect(screen.getByText('05s')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2_500); // +25 ticks → land on 30s
    });
    expect(screen.getByText('30s')).toBeInTheDocument();
  });

  test('after reaching 30s, count-up animates $0 → $1,247 over ~800ms', () => {
    render(<ThirtySecondCounter />);

    // Reach the done phase.
    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    expect(screen.getByText('30s')).toBeInTheDocument();

    // Advance the count-up. With cubic-ease-out + a 16ms RAF cadence,
    // we expect to be partway through after 400ms + fully landed after 800ms.
    act(() => {
      vi.advanceTimersByTime(400);
    });
    const partial = Number(screen.getByTestId('hero-30s-amount').textContent?.replace(/,/g, ''));
    expect(partial).toBeGreaterThan(0);
    expect(partial).toBeLessThanOrEqual(1_247);

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByTestId('hero-30s-amount')).toHaveTextContent('1,247');
  });

  test('"Done" badge appears only after the timer lands at 30s', () => {
    render(<ThirtySecondCounter />);
    expect(screen.queryByText('Done')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  test('imperative restart() resets seconds + USD + retriggers the timer', () => {
    const handle = createRef<ThirtySecondCounterHandle>();
    render(<ThirtySecondCounter autoStart={false} ref={handle} />);

    expect(handle.current).not.toBeNull();
    act(() => {
      handle.current?.restart();
    });

    expect(screen.getByText('00s')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(screen.getByText('10s')).toBeInTheDocument();

    // restart() mid-flight rewinds.
    act(() => {
      handle.current?.restart();
    });
    expect(screen.getByText('00s')).toBeInTheDocument();
  });
});

describe('ThirtySecondCounter — design system locks', () => {
  test('money number uses the emerald token (NOT cyan)', () => {
    render(<ThirtySecondCounter autoStart={false} />);
    const amountEl = screen.getByTestId('hero-30s-amount');
    expect(amountEl.className).toContain('text-[--color-money]');
    expect(amountEl.className).not.toContain('text-[--color-live]');
  });

  test('timer number uses the cyan/live token (NOT emerald)', () => {
    render(<ThirtySecondCounter autoStart={false} />);
    // Timer is the only `<output>` rendered when autoStart=false (no Done
    // badge, no count-up output yet — actually the amount output is
    // present too; query by the elapsed-aria-label specifically).
    const timer = screen.getByLabelText(/0 of 30 seconds elapsed/i);
    expect(timer.className).toContain('text-[--color-live]');
    expect(timer.className).not.toContain('text-[--color-money]');
  });

  test('illustrative-amount disclaimer is on the page (honest scope)', () => {
    render(<ThirtySecondCounter autoStart={false} />);
    expect(
      screen.getByText(/First fill in this demo · representative amount/i),
    ).toBeInTheDocument();
  });
});
