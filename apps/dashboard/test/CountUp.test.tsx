/**
 * CountUp — RAF-driven count-up tests.
 *
 * jsdom doesn't drive `requestAnimationFrame` from the event loop the way
 * a browser does — vitest's `vi.advanceTimersToNextFrame()` (vitest 4.x
 * fake-timers) is the canonical way to step the RAF queue.
 */

import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { CountUp } from '../src/components/CountUp';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('CountUp', () => {
  test('renders the initial value formatted en-US', () => {
    const { container } = render(<CountUp end={1234} noAnimate />);
    expect(container.textContent).toBe('1,234');
  });

  test('snaps to the new value when noAnimate=true', () => {
    const { container, rerender } = render(<CountUp end={0} noAnimate />);
    expect(container.textContent).toBe('0');
    rerender(<CountUp end={1500} noAnimate />);
    expect(container.textContent).toBe('1,500');
  });

  test('snaps to the new value under prefers-reduced-motion', () => {
    // Stub matchMedia to report prefers-reduced-motion: reduce.
    const mql = {
      matches: true,
      media: '(prefers-reduced-motion: reduce)',
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
      onchange: null,
    };
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => mql),
    );

    const { container, rerender } = render(<CountUp end={0} />);
    rerender(<CountUp end={9000} />);
    // No frame advance — should already be at the end.
    expect(container.textContent).toBe('9,000');
  });

  test('animates from start → end over the requested duration (RAF)', async () => {
    // Mock matchMedia: motion is allowed.
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: false,
        media: '(prefers-reduced-motion: reduce)',
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
        onchange: null,
      })),
    );

    const { container, rerender } = render(<CountUp end={0} durationMs={300} />);
    expect(container.textContent).toBe('0');

    rerender(<CountUp end={1000} durationMs={300} />);

    // Advance halfway — should be partway through (cubic ease-out is
    // asymmetric so it'll be past 50%).
    await act(async () => {
      vi.advanceTimersByTime(150);
      // Step the RAF queue.
      vi.advanceTimersToNextFrame();
    });
    const partial = Number.parseInt(container.textContent?.replace(/,/g, '') ?? '0', 10);
    expect(partial).toBeGreaterThan(0);
    expect(partial).toBeLessThanOrEqual(1000);

    // Advance to the end.
    await act(async () => {
      vi.advanceTimersByTime(200);
      vi.advanceTimersToNextFrame();
    });
    expect(container.textContent).toBe('1,000');
  });

  test('mid-animation re-target picks up the latest displayed value (no plan-sketch race)', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: false,
        media: '(prefers-reduced-motion: reduce)',
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
        onchange: null,
      })),
    );

    const { container, rerender } = render(<CountUp end={0} durationMs={400} />);
    rerender(<CountUp end={1000} durationMs={400} />);

    // Advance partway through the first animation.
    await act(async () => {
      vi.advanceTimersByTime(150);
      vi.advanceTimersToNextFrame();
    });

    // Now retarget to a higher value — the new animation must start from
    // the CURRENT displayed value, not from zero (the plan markdown's
    // `previous.current = end` race would have it animate from the wrong
    // baseline).
    rerender(<CountUp end={2500} durationMs={400} />);

    await act(async () => {
      vi.advanceTimersByTime(450);
      vi.advanceTimersToNextFrame();
    });

    // Should land at 2,500.
    expect(container.textContent).toBe('2,500');
  });
});
