/**
 * CountUp — animates a number from its previous render value to the new one.
 *
 * Uses requestAnimationFrame for smooth 60fps under load + cubic ease-out so
 * the deceleration matches the rest of the dashboard's motion language
 * (`cubic-bezier(0.22, 1, 0.36, 1)` shape).
 *
 * Bug-fix vs the plan markdown's sketch (§3.2):
 *
 *   The sketch sets `previous.current = end` INSIDE the animate callback's
 *   final tick. If `end` changes mid-animation (a new event arrives before
 *   the previous count-up landed), the snapshot is wrong. The fix: snapshot
 *   the START value at effect-fire time + capture `end` as the closure
 *   target. On any re-render with a new `end`, the effect re-runs, captures
 *   the LATEST displayed value as the new start, and animates from there.
 *
 * Reduced-motion bypass:
 *
 *   `prefers-reduced-motion: reduce` users get a snap to the end value, no
 *   RAF loop. The global CSS reset in `index.css` already neuters CSS
 *   transitions, but it doesn't touch JS RAF — so we check explicitly.
 */

import { useEffect, useRef, useState } from 'react';

interface CountUpProps {
  end: number;
  /** Total animation duration in ms. Default 320ms (matches --animate-count-up cadence). */
  durationMs?: number;
  /** Locale for `toLocaleString` formatting. Default "en-US". */
  locale?: string;
  /** Force-skip the animation (useful for tests + replay rewinds). */
  noAnimate?: boolean;
}

const DEFAULT_DURATION_MS = 320;

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function CountUp({
  end,
  durationMs = DEFAULT_DURATION_MS,
  locale = 'en-US',
  noAnimate = false,
}: CountUpProps): JSX.Element {
  const [displayed, setDisplayed] = useState(end);
  const rafIdRef = useRef<number | null>(null);

  // Use a ref to track the LATEST displayed value so a re-fire of the effect
  // can read "where am I now?" without depending on stale state. (Without
  // this, a fast burst of new `end` values would each animate from the
  // previous *prop*, not from where we currently are visually.)
  const displayedRef = useRef(end);
  displayedRef.current = displayed;

  useEffect(() => {
    if (noAnimate || prefersReducedMotion()) {
      setDisplayed(end);
      return;
    }

    const start = displayedRef.current;
    const startTime = performance.now();
    const target = end;

    function tick(now: number): void {
      const t = Math.min(1, (now - startTime) / durationMs);
      const eased = 1 - (1 - t) ** 3;
      const current = start + (target - start) * eased;
      setDisplayed(current);
      if (t < 1) {
        rafIdRef.current = requestAnimationFrame(tick);
      } else {
        rafIdRef.current = null;
      }
    }

    rafIdRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [end, durationMs, noAnimate]);

  return <>{Math.floor(displayed).toLocaleString(locale)}</>;
}
