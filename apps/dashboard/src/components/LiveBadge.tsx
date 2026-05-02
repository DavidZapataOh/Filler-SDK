/**
 * `LiveBadge` — connection-alive indicator.
 *
 * design.txt: "icons need no color. Their job is to be recognizable
 * symbols. Color should be reserved for communicating status."
 *
 * The dot here IS the status — it's allowed to carry the only color in the
 * badge. The label text uses muted gray (zinc-400). Three states:
 *
 *   - "live"        — cyan-400 + pulse animation. Connected, receiving events.
 *   - "degraded"    — amber-400, no pulse. SSE reconnecting.
 *   - "disconnected"— red-400, no pulse. Stream gave up.
 *
 * Cyan (not emerald) for "live" because emerald is reserved for the money
 * counter — the demo's single accent. Mixing them dilutes the narrative.
 */

import clsx from 'clsx';

export type LiveStatus = 'live' | 'degraded' | 'disconnected';

const STATUS_TEXT: Record<LiveStatus, string> = {
  live: 'Live',
  degraded: 'Reconnecting',
  disconnected: 'Disconnected',
};

interface LiveBadgeProps {
  status: LiveStatus;
  /** Optional override label — useful for replay-mode ("Replaying"). */
  label?: string;
  className?: string;
}

export function LiveBadge({ status, label, className }: LiveBadgeProps): JSX.Element {
  // <output> has implicit role="status"; biome's useSemanticElements prefers
  // it over <span role="status"> + we get aria-live=polite for free in modern
  // browsers. RTL's getByRole('status') still finds it.
  return (
    <output
      aria-live="polite"
      data-status={status}
      className={clsx(
        'inline-flex items-center gap-2 rounded-full',
        'border border-[--color-border-subtle] bg-[--color-surface-1]',
        'px-3 py-1 text-xs text-[--color-text-muted]',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={clsx(
          'inline-block size-2 rounded-full',
          status === 'live' && 'bg-[--color-live] animate-[pulse-live_2.4s_ease-in-out_infinite]',
          status === 'degraded' && 'bg-[--color-warn]',
          status === 'disconnected' && 'bg-[--color-error]',
        )}
      />
      <span className="font-medium tracking-wide">{label ?? STATUS_TEXT[status]}</span>
    </output>
  );
}
