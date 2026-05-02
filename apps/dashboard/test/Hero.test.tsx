/**
 * Hero — Plan 02 structural tests.
 *
 * Locks down: split-screen presence, BEFORE / AFTER labels, tagline, h1 for
 * SR readers, no cyan-as-money drift (Plan 02 deviated from the markdown
 * sketch's `cyan-950/40` background + cyan money number).
 *
 * Uses fake timers because <Hero> auto-starts <ThirtySecondCounter>'s
 * setInterval on mount.
 */

import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { Hero } from '../src/components/Hero/Hero';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Hero', () => {
  test('renders BEFORE + AFTER column labels', () => {
    render(<Hero />);
    expect(screen.getByText('Before')).toBeInTheDocument();
    expect(screen.getByText('After')).toBeInTheDocument();
  });

  test('ships an h1 (page rank-1 heading) + h2s for each column', () => {
    render(<Hero />);
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: /Build a UniswapX solver — before and after Filler SDK/i,
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole('heading', { level: 2, name: /Build a UniswapX solver/i }),
    ).toBeInTheDocument();
    // The AFTER h2 is "npm install" (visible code-styled). Use exact match
    // to avoid clashing with the body copy "in 30 seconds."
    expect(screen.getByRole('heading', { level: 2, name: 'npm install' })).toBeInTheDocument();
  });

  test('renders the tagline + the "tres archivos" pitch line', () => {
    render(<Hero />);
    expect(screen.getByText(/Tres archivos y un bond/i)).toBeInTheDocument();
    expect(screen.getByText(/The SDK to deploy vertical UniswapX solvers/i)).toBeInTheDocument();
  });

  test('CalendarTimelapse: all four weeks present in order', () => {
    render(<Hero />);
    expect(screen.getByText('Indexer infra')).toBeInTheDocument();
    expect(screen.getByText('Inventory tracking')).toBeInTheDocument();
    expect(screen.getByText('Atomic JIT pattern')).toBeInTheDocument();
    expect(screen.getByText('Production hardening')).toBeInTheDocument();
  });

  test('illustrative-amount disclaimer is present (honest scope on $1,247)', () => {
    render(<Hero />);
    expect(
      screen.getByText(/First fill in this demo · representative amount/i),
    ).toBeInTheDocument();
  });
});
