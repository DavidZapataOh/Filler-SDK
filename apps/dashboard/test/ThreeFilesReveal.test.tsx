/**
 * ThreeFilesReveal — Plan 05 timing + design-system tests.
 *
 * Manual mode is synchronous prop-driven (no fake timers needed).
 * Auto mode uses fake timers to advance the staggered reveal.
 *
 * The most important assertions:
 *   - `manual` mode pins reveal state to `step` exactly (Plan 07 needs
 *     deterministic step control for replay).
 *   - FillerBond.sol uses `--color-money` (emerald), NOT cyan. Plan
 *     markdown sketched cyan. (See F-43 / F-47 family — emerald for
 *     positive-action / financial-mechanism semantics.)
 *   - Pure-white token is NOT used here (reservation discipline — that
 *     token is for the live-counter Big Numbers + JIT current-tick).
 */

import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { ThreeFilesReveal } from '../src/components/ThreeFilesReveal';

describe('ThreeFilesReveal — manual mode (Plan 07 driver)', () => {
  test('step=0 hides every card', () => {
    render(<ThreeFilesReveal trigger="manual" step={0} />);
    for (const name of ['strategy.ts', 'filler.ts', 'config.ts', 'FillerBond.sol']) {
      expect(screen.getByTestId(`file-card-${name}`)).toHaveAttribute('data-visible', 'false');
    }
    expect(screen.getByTestId('three-files-reveal')).toHaveAttribute('data-revealed', '0');
  });

  test('step=2 shows the first two cards, hides the rest', () => {
    render(<ThreeFilesReveal trigger="manual" step={2} />);
    expect(screen.getByTestId('file-card-strategy.ts')).toHaveAttribute('data-visible', 'true');
    expect(screen.getByTestId('file-card-filler.ts')).toHaveAttribute('data-visible', 'true');
    expect(screen.getByTestId('file-card-config.ts')).toHaveAttribute('data-visible', 'false');
    expect(screen.getByTestId('file-card-FillerBond.sol')).toHaveAttribute('data-visible', 'false');
  });

  test('step=4 shows every card + the final caption', () => {
    render(<ThreeFilesReveal trigger="manual" step={4} />);
    for (const name of ['strategy.ts', 'filler.ts', 'config.ts', 'FillerBond.sol']) {
      expect(screen.getByTestId(`file-card-${name}`)).toHaveAttribute('data-visible', 'true');
    }
    const caption = screen.getByTestId('three-files-final-caption');
    expect(caption).toHaveAttribute('aria-hidden', 'false');
  });

  test('step prop changes drive re-render (replay-mode rewind)', () => {
    const { rerender } = render(<ThreeFilesReveal trigger="manual" step={3} />);
    expect(screen.getByTestId('three-files-reveal')).toHaveAttribute('data-revealed', '3');

    rerender(<ThreeFilesReveal trigger="manual" step={0} />);
    expect(screen.getByTestId('three-files-reveal')).toHaveAttribute('data-revealed', '0');

    rerender(<ThreeFilesReveal trigger="manual" step={4} />);
    expect(screen.getByTestId('three-files-reveal')).toHaveAttribute('data-revealed', '4');
  });

  test('clamps out-of-bounds step to [0, 4]', () => {
    const { rerender } = render(<ThreeFilesReveal trigger="manual" step={-2} />);
    expect(screen.getByTestId('three-files-reveal')).toHaveAttribute('data-revealed', '0');

    rerender(<ThreeFilesReveal trigger="manual" step={42} />);
    expect(screen.getByTestId('three-files-reveal')).toHaveAttribute('data-revealed', '4');
  });

  test('manual mode does NOT auto-advance (no timer interference with replay)', () => {
    vi.useFakeTimers();
    try {
      render(<ThreeFilesReveal trigger="manual" step={1} />);
      act(() => {
        vi.advanceTimersByTime(10_000);
      });
      // Still pinned to step=1 — manual mode ignores the internal timer.
      expect(screen.getByTestId('three-files-reveal')).toHaveAttribute('data-revealed', '1');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('ThreeFilesReveal — auto mode', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test('starts at 0 cards revealed on mount', () => {
    render(<ThreeFilesReveal trigger="auto" />);
    expect(screen.getByTestId('three-files-reveal')).toHaveAttribute('data-revealed', '0');
  });

  test('reveals the first card after 600 ms, then 800 ms per subsequent', () => {
    render(<ThreeFilesReveal trigger="auto" />);
    expect(screen.getByTestId('three-files-reveal')).toHaveAttribute('data-revealed', '0');

    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(screen.getByTestId('three-files-reveal')).toHaveAttribute('data-revealed', '1');

    act(() => {
      vi.advanceTimersByTime(800);
    });
    expect(screen.getByTestId('three-files-reveal')).toHaveAttribute('data-revealed', '2');

    act(() => {
      vi.advanceTimersByTime(800);
    });
    expect(screen.getByTestId('three-files-reveal')).toHaveAttribute('data-revealed', '3');

    act(() => {
      vi.advanceTimersByTime(800);
    });
    expect(screen.getByTestId('three-files-reveal')).toHaveAttribute('data-revealed', '4');
  });

  test('stops advancing once all cards are revealed', async () => {
    render(<ThreeFilesReveal trigger="auto" />);
    // Advance in chunks so React's `useEffect` cleanup + re-fire cycle has
    // a chance to schedule the next timer between each tick. A single
    // `advanceTimersByTime(10_000)` would only fire the FIRST timer (the
    // chained ones are scheduled inside React renders, not synchronously).
    for (const ms of [600, 800, 800, 800]) {
      await act(async () => {
        vi.advanceTimersByTime(ms);
      });
    }
    expect(screen.getByTestId('three-files-reveal')).toHaveAttribute('data-revealed', '4');

    // Now flush a long idle and confirm we don't go past 4.
    await act(async () => {
      vi.advanceTimersByTime(5_000);
    });
    expect(screen.getByTestId('three-files-reveal')).toHaveAttribute('data-revealed', '4');
  });
});

describe('ThreeFilesReveal — design system locks', () => {
  test('FillerBond.sol uses emerald (--color-money), NOT cyan', () => {
    render(<ThreeFilesReveal trigger="manual" step={4} />);
    const bond = screen.getByTestId('file-card-FillerBond.sol');
    expect(bond.getAttribute('data-bond')).toBe('true');
    // Border or text uses --color-money somewhere on the card.
    expect(bond.outerHTML).toContain('--color-money');
    // No cyan class anywhere on the bond card.
    expect(bond.outerHTML).not.toMatch(/\bcyan-\d/);
    expect(bond.outerHTML).not.toContain('--color-live');
  });

  test('the three TS files use neutrals — no money/live color leak', () => {
    render(<ThreeFilesReveal trigger="manual" step={3} />);
    for (const name of ['strategy.ts', 'filler.ts', 'config.ts']) {
      const card = screen.getByTestId(`file-card-${name}`);
      // Quiet neutral palette only — no money color, no live color.
      expect(card.outerHTML).not.toContain('--color-money');
      expect(card.outerHTML).not.toContain('--color-live');
      expect(card.outerHTML).not.toMatch(/\bcyan-\d/);
      expect(card.outerHTML).not.toMatch(/\bemerald-\d/);
    }
  });

  test('pure-white token NOT used (reserved for live counters + JIT marker)', () => {
    const { container } = render(<ThreeFilesReveal trigger="manual" step={4} />);
    // No --color-text-primary anywhere — that's reserved for HeroCounter /
    // SpreadCounter Big Numbers + JIT current-tick marker.
    expect(container.innerHTML).not.toContain('--color-text-primary');
  });

  test('final caption uses muted gray, NOT cyan (Plan markdown sketched cyan)', () => {
    render(<ThreeFilesReveal trigger="manual" step={4} />);
    const caption = screen.getByTestId('three-files-final-caption');
    expect(caption.className).toContain('text-[--color-text-muted]');
    expect(caption.className).not.toContain('text-[--color-live]');
    expect(caption.className).not.toMatch(/\bcyan-\d/);
  });
});

describe('ThreeFilesReveal — accessibility', () => {
  test('uses an ordered list for the three files and the bond', () => {
    render(<ThreeFilesReveal trigger="manual" step={0} />);
    const list = screen.getByRole('list', { name: /three files and a bond/i });
    expect(list.tagName).toBe('OL');
  });

  test('headline contains the canonical mantra', () => {
    render(<ThreeFilesReveal trigger="manual" step={0} />);
    expect(screen.getByText(/Three files and a bond/i)).toBeInTheDocument();
  });

  test('"Skin in the game" appears as the FillerBond.sol card blurb', () => {
    render(<ThreeFilesReveal trigger="manual" step={4} />);
    const bond = screen.getByTestId('file-card-FillerBond.sol');
    expect(bond.textContent).toMatch(/skin in the game/i);
  });
});
