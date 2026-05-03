/**
 * ThreeFilesReveal — the demo's visual climax.
 *
 * Four file cards arranged in a 2×2 (mobile) / 4-up (desktop) grid. Each
 * appears in sequence as the voiceover narrates "tres archivos y un bond":
 *
 *   1. strategy.ts   — what to fill
 *   2. filler.ts     — how to run
 *   3. config.ts     — your environment
 *   4. FillerBond.sol — y un bond. (the on-chain stake contract)
 *
 * The first three are TypeScript files the user authors via `create-filler`;
 * the fourth is the Solidity contract on-chain. The fourth gets a distinct
 * visual treatment because it IS the climax beat.
 *
 * Design system applied:
 *
 *   - The three TS files use neutral surface tokens (zinc grays). They
 *     fade up but stay quiet — design.txt: "color doesn't need to be
 *     complex." The eye should park on the BOND, not on whichever of
 *     three twins arrives first.
 *
 *   - FillerBond.sol gets emerald border + emerald glow (NOT cyan). The
 *     bond is the financial-commitment primitive — same money family as
 *     the captured-spread numbers across the dashboard. Visual rhyme:
 *     wherever you see emerald, you see the value mechanism. Cyan would
 *     have been arbitrary "tech accent."
 *
 *   - Pure-white reservation: NOT used here. Pure white is reserved for
 *     the running counters (HeroCounter / SpreadCounter Big Numbers, and
 *     JIT depth current-tick marker). Reusing it on the bond card would
 *     dilute the page's "ONE pure-white-thing" discipline.
 *
 *   - Icons stay neutral; color carries status, not decoration. The
 *     bond's icon gets a faint emerald tint — sub-200% on the brand
 *     color rule (icons need no color, but icon-as-status is allowed).
 *
 * Two trigger modes:
 *
 *   - `auto` (default): self-advances 0 → 4 with a 600 ms initial pause +
 *     800 ms per file. Total reveal ≈ 3 seconds.
 *   - `manual` with a `step` prop: a parent (replay-mode in Plan 07)
 *     drives the reveal exactly to a step. The component does NOT
 *     auto-advance in manual mode; `step` is the source of truth.
 *
 * Replay-mode (Plan 07): set `trigger="manual"` + drive `step` from the
 * fixture timeline. The component will re-sync any time `step` changes,
 * so a `step=0` rewind cleanly resets the visual without reload.
 */

import clsx from 'clsx';
import { Coins, FileCode2, FileText, Settings2 } from 'lucide-react';
import type { ComponentType, SVGProps } from 'react';
import { useEffect, useState } from 'react';

interface FileEntry {
  name: string;
  lang: string;
  blurb: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** True for FillerBond.sol — gets the emerald climax treatment. */
  isBond: boolean;
}

const FILES: readonly FileEntry[] = [
  {
    name: 'strategy.ts',
    lang: 'TypeScript',
    blurb: 'What to fill',
    icon: FileCode2,
    isBond: false,
  },
  {
    name: 'filler.ts',
    lang: 'TypeScript',
    blurb: 'How to run',
    icon: FileText,
    isBond: false,
  },
  {
    name: 'config.ts',
    lang: 'TypeScript',
    blurb: 'Your environment',
    icon: Settings2,
    isBond: false,
  },
  {
    name: 'FillerBond.sol',
    lang: 'Solidity',
    blurb: 'Skin in the game',
    icon: Coins,
    isBond: true,
  },
] as const;

const TOTAL_STEPS = FILES.length;
const FIRST_STEP_MS = 600; // a small breath before the first card lands
const STEP_GAP_MS = 800; // narrator-friendly cadence between cards

export interface ThreeFilesRevealProps {
  /**
   * Reveal driver. Default `auto` self-advances on a timer; `manual`
   * pins reveal state to the `step` prop (Plan 07 replay-mode pattern).
   */
  trigger?: 'auto' | 'manual';
  /**
   * In manual mode, the number of cards revealed (0 → 4). Ignored in
   * auto mode. Clamped to [0, 4].
   */
  step?: number;
  className?: string;
}

export function ThreeFilesReveal({
  trigger = 'auto',
  step,
  className,
}: ThreeFilesRevealProps): JSX.Element {
  // In manual mode, `step` is the source of truth. In auto mode, internal
  // state self-advances; `step` is ignored (don't conflate sources).
  const [autoRevealed, setAutoRevealed] = useState(0);

  useEffect(() => {
    if (trigger !== 'auto') return;
    if (autoRevealed >= TOTAL_STEPS) return;

    const delay = autoRevealed === 0 ? FIRST_STEP_MS : STEP_GAP_MS;
    const timer = setTimeout(() => {
      setAutoRevealed((r) => Math.min(TOTAL_STEPS, r + 1));
    }, delay);
    return () => clearTimeout(timer);
  }, [trigger, autoRevealed]);

  const revealed =
    trigger === 'manual' ? Math.min(TOTAL_STEPS, Math.max(0, step ?? 0)) : autoRevealed;
  const isComplete = revealed >= TOTAL_STEPS;

  return (
    <div
      className={clsx(
        // Surface chrome: same `--color-surface-1` + subtle border as the
        // other dashboard cards. Borders > extra bg layers (design.txt).
        'rounded-2xl border border-[--color-border-subtle] bg-[--color-surface-1] p-6 sm:p-8',
        className,
      )}
      data-testid="three-files-reveal"
      data-revealed={revealed}
    >
      <header className="mb-6 text-center">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-[--color-text-subtle]">
          Memetic handle
        </p>
        <h3
          // Mono italic ties to "code-shape" — the demo's repeated
          // visual cue for "this is THE quote."
          className="mt-1 font-mono text-lg italic text-[--color-text-default] sm:text-xl"
        >
          &ldquo;Three files and a bond.&rdquo;
        </h3>
      </header>

      <ol
        // <ol> conveys ordered phases for assistive tech; the visible
        // grid layout is purely visual.
        aria-label="Three files and a bond — Filler SDK solver structure"
        className="grid grid-cols-2 gap-4 lg:grid-cols-4"
      >
        {FILES.map((file, i) => (
          <FileCard
            key={file.name}
            file={file}
            visible={i < revealed}
            isCurrent={i === revealed - 1}
          />
        ))}
      </ol>

      <FinalCaption visible={isComplete} />
    </div>
  );
}

// === FileCard ============================================================

interface FileCardProps {
  file: FileEntry;
  visible: boolean;
  isCurrent: boolean;
}

function FileCard({ file, visible, isCurrent }: FileCardProps): JSX.Element {
  const Icon = file.icon;

  return (
    <li
      data-testid={`file-card-${file.name}`}
      data-visible={visible ? 'true' : 'false'}
      data-bond={file.isBond ? 'true' : 'false'}
      data-current={isCurrent ? 'true' : 'false'}
      className={clsx(
        // Layout — fixed border-WIDTH stays constant so the highlight
        // toggle never causes CLS jitter (we only flip color/shadow).
        'relative flex flex-col gap-2 rounded-xl border p-5 transition-[opacity,transform,border-color,box-shadow] duration-500 ease-out motion-reduce:transition-none',
        // Reveal state (motion-safe; reduce-motion overrides via the
        // global @media rule in src/index.css → instant snap).
        visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0',
        // Bond styling — emerald border baseline so it always reads
        // as "this is the climax even when not yet revealed."
        file.isBond
          ? 'border-[--color-money]/40 bg-[--color-surface-2]'
          : 'border-[--color-border-default] bg-[--color-surface-2]',
        // Current beat — bond gets a glow; the three TS files get a
        // brightened border (NOT a glow — glow is reserved for the bond
        // climax to keep the visual hierarchy honest).
        isCurrent &&
          file.isBond &&
          'shadow-[0_0_28px_-4px_var(--color-money-faint)] border-[--color-money]',
        isCurrent && !file.isBond && 'border-[--color-border-strong]',
      )}
    >
      <div className="flex items-center gap-2">
        <Icon
          aria-hidden="true"
          className={clsx(
            'size-5',
            file.isBond ? 'text-[--color-money]' : 'text-[--color-text-faint]',
          )}
        />
        <span className="text-xs uppercase tracking-[0.15em] text-[--color-text-subtle]">
          {file.lang}
        </span>
      </div>
      <p
        className={clsx(
          'font-mono font-semibold tracking-tight',
          // Visible-from-6-metres requirement — mobile 1.125rem (18 px),
          // desktop 1.5rem (24 px+). Bond gets bumped slightly for hierarchy.
          file.isBond ? 'text-xl sm:text-2xl' : 'text-lg sm:text-xl',
          file.isBond ? 'text-[--color-money]' : 'text-[--color-text-default]',
        )}
      >
        {file.name}
      </p>
      <p className="text-sm text-[--color-text-muted]">{file.blurb}</p>
    </li>
  );
}

// === Final caption =======================================================

interface FinalCaptionProps {
  visible: boolean;
}

function FinalCaption({ visible }: FinalCaptionProps): JSX.Element {
  return (
    <p
      data-testid="three-files-final-caption"
      aria-hidden={visible ? 'false' : 'true'}
      className={clsx(
        'mt-6 text-center font-mono text-sm transition-opacity duration-500 motion-reduce:transition-none',
        // Reinforcement, not data — uses `--color-text-muted`. Plan
        // markdown's `text-cyan-400` would have hijacked the live-status
        // semantic for a completion message.
        'text-[--color-text-muted]',
        visible ? 'opacity-100' : 'opacity-0',
      )}
    >
      Three files, and <span className="text-[--color-money]">one bond</span>. Demo in 90 seconds.
    </p>
  );
}
