/**
 * CalendarTimelapse — the BEFORE side's visualisation.
 *
 * Goal: communicate "this took weeks" by making the items feel tedious +
 * faded — without using error/warning colors. design.txt is explicit:
 * "color doesn't need to be complex." The BEFORE side reads as "tedious"
 * because of:
 *
 *   1. Drained palette — every element uses zinc-500/600/700 + zinc-800
 *      borders. No accent at all. (10% accent budget belongs to the AFTER
 *      side's money-captured number.)
 *   2. Staggered entry (250ms apart) — the eye sees four checkpoints
 *      arrive sequentially, parsing it as "phases that follow each other,"
 *      not as a single instant.
 *   3. The week badges are monospace + bordered — code-ish, infrastructure-y,
 *      not friendly. Reinforces the "infrastructure work" narrative.
 *
 * What this is NOT:
 *   - NOT pulsing (`animate-pulse` would read as "loading state," wrong
 *     mental model — see plans/FEEDBACK.md F-44).
 *   - NOT red / amber / orange (would read as "broken / warning,"
 *     wrong narrative — the BEFORE is "you DID succeed, but it took 4
 *     weeks of work").
 *
 * Reduced-motion respect: the global rule in src/index.css cancels the
 * animations; the items are still visible (no opacity-0 trap).
 */

const WEEKS = [
  { week: 1, task: 'Indexer infra', detail: 'Ponder + RPC + reorgs' },
  { week: 2, task: 'Inventory tracking', detail: 'ERC20 balance reconciliation' },
  { week: 3, task: 'Atomic JIT pattern', detail: 'reactorCallback ↔ unlockCallback' },
  { week: 4, task: 'Production hardening', detail: 'Bond, monitoring, fuzz tests' },
] as const;

interface CalendarTimelapseProps {
  className?: string;
}

export function CalendarTimelapse({ className }: CalendarTimelapseProps): JSX.Element {
  return (
    <ol
      // <ol> conveys ordered phases to assistive tech without us having to
      // bolt aria-roles onto a div. Per design.txt: semantic elements
      // first, ARIA second.
      aria-label="Four-week solver bringup checklist"
      className={['flex flex-col gap-3', className].filter(Boolean).join(' ')}
    >
      {WEEKS.map(({ week, task, detail }, i) => (
        <li
          key={week}
          // motion-safe: only animate when the user hasn't asked us not to.
          className="motion-safe:opacity-0 motion-safe:animate-[slide-up_360ms_cubic-bezier(0.22,1,0.36,1)_forwards]"
          style={{ animationDelay: `${i * 250}ms` }}
        >
          <div className="flex items-center gap-3">
            <WeekBadge week={week} />
            <div className="flex flex-col">
              <span className="text-sm font-medium text-[--color-text-muted]">{task}</span>
              <span className="text-xs text-[--color-text-faint]">{detail}</span>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

function WeekBadge({ week }: { week: number }): JSX.Element {
  return (
    <span
      aria-hidden="true"
      // Bordered card, NOT a filled background. design.txt:
      // "sometimes a simple border is the best solution."
      className="inline-flex size-9 items-center justify-center rounded-md border border-[--color-border-default] bg-[--color-surface-2] font-mono text-xs font-semibold text-[--color-text-subtle]"
    >
      W{week}
    </span>
  );
}
