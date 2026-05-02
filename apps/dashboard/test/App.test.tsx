/**
 * App — smoke test that the page renders + the demo narrative is intact.
 *
 * Plan 02 restructured the layout: the Hero (before/after) lives at the
 * top + ships the page's h1; the live capture section sits below as h2.
 * Each test below names which plan owns the assertion.
 *
 * Tests use `vi.useFakeTimers()` because <Hero> mounts the
 * ThirtySecondCounter which auto-starts a setInterval. Without fake timers,
 * vitest's exit hangs while real timers tick.
 */

import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { App } from '../src/App';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('App', () => {
  test('renders the brand mark + name (Plan 01)', () => {
    render(<App />);
    expect(screen.getByText('Filler SDK')).toBeInTheDocument();
  });

  test('Plan 02 — h1 is the before/after hero headline', () => {
    render(<App />);
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: /Build a UniswapX solver — before and after Filler SDK/i,
      }),
    ).toBeInTheDocument();
  });

  test('Plan 02 — Hero ships both BEFORE + AFTER columns + tagline', () => {
    render(<App />);
    expect(screen.getByText('Before')).toBeInTheDocument();
    expect(screen.getByText('After')).toBeInTheDocument();
    // Tagline appears in Hero + header subtitle + footer — at least one.
    expect(screen.getAllByText(/Tres archivos y un bond/i).length).toBeGreaterThan(0);
  });

  test('Plan 03 — the live-capture h2 is below the hero', () => {
    render(<App />);
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: /DAO treasuries internalising their own spread/i,
      }),
    ).toBeInTheDocument();
  });

  test('Plan 06 — live badge in header reflects spread-stream status', () => {
    render(<App />);
    const statuses = screen.getAllByRole('status');
    // Header LiveBadge has data-status; Hero's <output>s do not. With no
    // VITE_SPREAD_EMITTER_URL set in tests, the spread stream is `idle`
    // → maps to `disconnected` per useSpreadStream's badge mapping.
    const liveBadge = statuses.find((el) => el.hasAttribute('data-status'));
    expect(liveBadge).toBeDefined();
    expect(liveBadge?.getAttribute('data-status')).toBe('disconnected');
  });

  test('Plans 03/04/05/07 — four placeholder slots present', () => {
    render(<App />);
    expect(screen.getByText(/JIT depth/i)).toBeInTheDocument();
    expect(screen.getByText(/Three files/i)).toBeInTheDocument();
    expect(screen.getByText(/Recent fills/i)).toBeInTheDocument();
    expect(screen.getByText(/Replay mode/i)).toBeInTheDocument();
  });

  test('keeps the "tres archivos y un bond" tagline somewhere on the page', () => {
    render(<App />);
    // The tagline appears in the Hero, the header subtitle, and the footer.
    expect(screen.getAllByText(/tres archivos y un bond/i).length).toBeGreaterThan(0);
  });
});
