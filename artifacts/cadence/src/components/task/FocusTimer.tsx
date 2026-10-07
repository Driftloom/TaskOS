import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Clock,
  Coffee,
  History,
  Pause,
  Play,
  RotateCcw,
  Square,
  TriangleAlert,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { formatTimer } from '@/lib/date-utils';
import { StatusIndicator, type TaskStatus } from './CadenceDomain';

/**
 * FocusTimer — docs/13-master-design-system-prompt.md §P11.1 (P0).
 *
 * Extracted from `pages/focus/FocusPage.tsx`, which defined its own card,
 * status pill, progress bar and controls. §P4 forbids that ("a page may not
 * define its own button, card, chip, or sheet").
 *
 * ## Non-negotiables enforced here (verbatim from §P11.1)
 *
 * 1. "Tabular digits" — the readout uses `text-timer` (the §P7 `type.timer`
 *    token: 56px / 600 / -0.02em) plus an explicit `tabular-nums`, because §P7
 *    requires it "for timers, counts, times, log tables, and anything that
 *    updates in place (prevents jitter)".
 *
 *    This readout was `font-mono`, on the reasoning that mono is where
 *    tabular figures come from. That was the wrong mechanism: §P7 asks for
 *    `font-variant-numeric`, not for a monospace family, and the note above
 *    already stated `tabular-nums` explicitly so it did not depend on the
 *    `.font-mono` side effect. At 56px a monospace face is also simply worse to
 *    read -- wider glyphs, mechanical rhythm -- so the hero numeral of the
 *    focus screen was being set in a face no other surface uses. It is now the
 *    Display cut, which is the ≥20pt face §P7 assigns to `type.timer`.
 * 2. "Controls ≥ 56px" — every control in the control row is `min-h-14`
 *    (3.5rem = 56px) or `size-14`. No `tap-target-expand` here: there is room,
 *    because the controls are separated by a `gap-3` (12px) and each box is
 *    itself ≥56px, so neighbouring hit areas cannot overlap (index.css's
 *    `tap-target-expand` caveat about centres <44px apart does not apply).
 * 3. "Announces start/pause/finish and remaining time ON REQUEST ONLY (never
 *    every second)" — the ticking seconds NEVER touch a live region. Only
 *    (a) genuine state transitions and (b) an explicit "Read time" press write
 *    to the polite region below. §P10 likewise: "Active timer → digits update
 *    in place (tabular); no looping pulse animation", so the pulsing status
 *    dot that FocusPage used is gone.
 * 4. "State survives backgrounding and reopen" — the readout is derived from
 *    wall-clock deltas, never from a counter that a suspended tab can lose, and
 *    `FocusPage` persists a run anchor to `localStorage`. This component is the
 *    presentation half of that contract; it never owns the clock.
 *
 * ## States (§P11.1)
 * idle · running · paused · break · finished · recovered · sync-failed-but-running
 *
 * The caller supplies `state` rather than this component guessing it, so the
 * session's server status and the client-only recovery/sync facts stay in one
 * place (`FocusPage` derives it). `resolveFocusTimerState` is exported as that
 * pure derivation so it can be reasoned about (and unit-tested) on its own.
 *
 * ## Composition (§P11.3 "Slots")
 * `secondaryActions` and `footer` let the page inject its own navigation and
 * settings affordances (the daily-target stepper, "back to today") without this
 * component knowing about routing or the `focus_settings` API.
 *
 * ASSUMPTION / NOT YET PRODUCED: the `break` state is fully implemented here
 * (markup, icon, copy, announcement, controls) but nothing emits it. The
 * `focus_sessions` contract has no break kind — `FocusSessionStatus` is
 * `active | paused | completed | canceled` and `FocusSessionInput` requires a
 * `taskId`, so a break cannot be persisted without a schema change. Per P0
 * rule 4, design work must not invent or change API contracts, so the state
 * ships ready and unwired rather than faked.
 *
 * ASSUMPTION / NOT YET MOUNTED: §P11.1 also asks for a "mini chip (persistent
 * above the tab bar)". Its only possible mount point is `chrome/AppShell.tsx`,
 * which is outside this task's ownership, and §P2 forbids building a component
 * "for completeness" with no screen needing it. Not built — see the handoff
 * report.
 */

/** §P11.1 required states. */
export type FocusTimerState =
  | 'idle'
  | 'running'
  | 'paused'
  | 'break'
  | 'finished'
  | 'recovered'
  | 'sync-failed-but-running';

export interface FocusTimerProps {
  state: FocusTimerState;
  /** Null renders the no-open-tasks empty state (§P17.2: context + explanation + next action). */
  taskTitle: string | null;
  plannedMinutes: number;
  elapsedSeconds: number;
  /** True while a start/pause/resume/finish mutation is in flight (§P12 loading preserves the box). */
  busy?: boolean;
  /** Populated for `sync-failed-but-running`; shown with icon + text, never colour alone (§P6.3). */
  syncError?: string | null;
  onStart?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onFinish?: () => void;
  /** Clears a finished round and returns to `idle`. */
  onReset?: () => void;
  /** `sync-failed-but-running` — re-send the minutes that never reached the server. */
  onRetrySync?: () => void;
  /** Rendered inside the control row, after the timer's own controls. */
  secondaryActions?: ReactNode;
  /** Rendered at the foot of the card, below the divider. */
  footer?: ReactNode;
  className?: string;
}

/**
 * The pure mapping from server/client facts to a §P11.1 state. Kept here (not in
 * the page) so the state machine has one auditable definition.
 */
export function resolveFocusTimerState({
  hasSession,
  sessionStatus,
  recovered,
  syncFailed,
}: {
  hasSession: boolean;
  sessionStatus: 'active' | 'paused' | 'completed' | 'canceled' | undefined;
  recovered: boolean;
  syncFailed: boolean;
}): FocusTimerState {
  if (!hasSession) return 'idle';
  if (sessionStatus === 'completed') return 'finished';
  if (sessionStatus === 'paused') return 'paused';
  // Past paused/completed, anything still active is a running round. Sync failure
  // outranks "recovered" because it is the fact the user must act on first.
  if (sessionStatus === 'active' && syncFailed) return 'sync-failed-but-running';
  if (sessionStatus === 'active' && recovered) return 'recovered';
  return 'running';
}

const STATUS_BY_STATE: Record<FocusTimerState, TaskStatus> = {
  idle: 'scheduled',
  running: 'running',
  paused: 'paused',
  break: 'scheduled',
  finished: 'done',
  recovered: 'running',
  'sync-failed-but-running': 'running',
};

/** "recovered", "sync-failed-but-running" and "break" have no StatusIndicator entry — they get icon + label here. */
const EXTRA_CHIP: Partial<Record<FocusTimerState, { icon: ReactNode; label: string; tone: string }>> = {
  // Neutral: a break is not a link and not a warning, so it borrows no semantic colour.
  break: { icon: <Coffee size={12} aria-hidden="true" />, label: 'Break', tone: 'text-muted-foreground' },
  recovered: { icon: <History size={12} aria-hidden="true" />, label: 'Recovered', tone: 'text-accent' },
  'sync-failed-but-running': {
    icon: <TriangleAlert size={12} aria-hidden="true" />,
    label: 'Not synced yet',
    tone: 'text-status-danger-text',
  },
};

const minutesLeft = (seconds: number) => Math.max(0, Math.ceil(seconds / 60));

function transitionAnnouncement(
  state: FocusTimerState,
  ctx: { taskTitle: string | null; plannedMinutes: number; elapsedSeconds: number; remainingSeconds: number },
): string {
  const subject = ctx.taskTitle ? `"${ctx.taskTitle}"` : 'this round';
  switch (state) {
    case 'idle':
      return `Ready. ${ctx.plannedMinutes} minute round.`;
    case 'running':
      return `Focus round started on ${subject}. ${minutesLeft(ctx.remainingSeconds)} minutes remaining.`;
    case 'recovered':
      return `Recovered your running round on ${subject}. ${formatTimer(ctx.elapsedSeconds)} elapsed, ${minutesLeft(ctx.remainingSeconds)} minutes remaining.`;
    case 'paused':
      return `Paused at ${formatTimer(ctx.elapsedSeconds)}.`;
    case 'break':
      return `Break started. ${minutesLeft(ctx.remainingSeconds)} minutes remaining.`;
    case 'finished':
      return `Round finished at ${formatTimer(ctx.elapsedSeconds)}. Logged to today's review.`;
    case 'sync-failed-but-running':
      return 'Still running, but these minutes have not reached the server yet. The timer has not stopped.';
    default:
      return '';
  }
}

export function FocusTimer({
  state,
  taskTitle,
  plannedMinutes,
  elapsedSeconds,
  busy = false,
  syncError = null,
  onStart,
  onPause,
  onResume,
  onFinish,
  onReset,
  onRetrySync,
  secondaryActions,
  footer,
  className = '',
}: FocusTimerProps) {
  const plannedSeconds = Math.max(1, plannedMinutes) * 60;
  const remainingSeconds = Math.max(0, plannedSeconds - elapsedSeconds);
  const percent = Math.min(100, Math.round((elapsedSeconds / plannedSeconds) * 100));
  const readout = formatTimer(elapsedSeconds);

  const isActive = state === 'running' || state === 'recovered' || state === 'sync-failed-but-running';
  const isFinished = state === 'finished';
  const reducedMotion = useReducedMotion();
  // "Has a round" is what makes Pause/Resume meaningful. Gating the control on
  // state alone let `idle` render a live "Resume" beside "Begin focus"; the page
  // handler then no-ops because there is no session, so the control looked live
  // and did nothing. §P12 requires a control that cannot act to be disabled with
  // a reason, never silently present.
  const hasRound = state !== 'idle' && state !== 'finished';
  const extra = EXTRA_CHIP[state];

  // --- announcements (§P11.1: on request only, never every second) ----------
  const [announcement, setAnnouncement] = useState('');
  const saidRef = useRef<FocusTimerState | null>(null);
  // The announcement must read the values at the moment of the transition, not
  // the values of whichever render the effect happened to close over.
  const spokenRef = useRef({ taskTitle, plannedMinutes, elapsedSeconds, remainingSeconds });
  spokenRef.current = { taskTitle, plannedMinutes, elapsedSeconds, remainingSeconds };

  const say = useCallback((message: string) => {
    // Clear first, then set on the next frame: identical consecutive text in a
    // live region is otherwise skipped by several screen readers, and "read
    // time" pressed twice in a row must speak twice.
    if (typeof window === 'undefined') {
      setAnnouncement(message);
      return;
    }
    setAnnouncement('');
    window.requestAnimationFrame(() => setAnnouncement(message));
  }, []);

  const announceState = useCallback(
    (next: FocusTimerState) => say(transitionAnnouncement(next, spokenRef.current)),
    [say],
  );

  useEffect(() => {
    // First render stays silent for every state except `recovered` — arriving
    // back at a round you left running IS the event worth hearing about.
    // Everything after that only speaks on a real transition.
    const isFirstRender = saidRef.current === null;
    if (isFirstRender && state !== 'recovered') {
      saidRef.current = state;
      return;
    }
    if (saidRef.current === state) return;
    saidRef.current = state;
    announceState(state);
  }, [state, announceState]);

  const readTime = () => {
    say(
      isActive
        ? `${formatTimer(elapsedSeconds)} elapsed, ${minutesLeft(remainingSeconds)} minutes remaining of ${plannedMinutes} planned.`
        : `${formatTimer(elapsedSeconds)} elapsed of ${plannedMinutes} planned.`,
    );
  };

  const statusTime =
    state === 'idle'
      ? `${plannedMinutes} min planned`
      : isFinished
        ? `${formatTimer(elapsedSeconds)} logged`
        : isActive
          ? `${minutesLeft(remainingSeconds)} min left`
          : `${formatTimer(elapsedSeconds)} elapsed`;

  return (
    <section
      aria-labelledby="focus-timer-heading"
      data-testid="focus-timer"
      data-state={state}
      className={`card-enterprise relative overflow-hidden rounded-lg border border-border bg-card p-6 shadow-e3 sm:p-8 ${className}`}
    >
      {/* Ambient light. Decorative only (P10: no decorative motion; this is static). */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-primary/10 blur-3xl"
      />

      <div className="relative">
        <h2 id="focus-timer-heading" className="sr-only">
          Focus round
        </h2>

        {/* Status chips — icon + text + semantic colour, never colour alone (§P6.3).
            The pill chrome is deliberately neutral: StatusIndicator owns the
            semantic colour of the label, so tinting the pill too would put two
            different semantic colours side by side (§P6.3 exclusivity).

            The neutral fill is `bg-card`, not `bg-muted`, and that is load-bearing
            rather than cosmetic: the scheduled label is `--accent`, which measures
            4.22:1 on `--muted` in dark and 4.32:1 in light — both under the 4.5:1
            floor — but 4.53:1 and 4.97:1 on `--card`. The `border-border-control`
            boundary is what carries SC 1.4.11 (4.60:1 dark, 3.70:1 light against
            `--card`), so the pill is still identifiable without the extra fill. */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border-control bg-card px-3 py-1 font-mono text-caption font-semibold uppercase tracking-wider">
            <StatusIndicator status={STATUS_BY_STATE[state]} timeText={statusTime} />
          </span>
          {extra ? (
            <span
              data-testid={`focus-timer-chip-${state}`}
              className={`inline-flex items-center gap-1 rounded-full border border-border-control bg-card px-2.5 py-1 font-mono text-caption font-semibold uppercase tracking-wider ${extra.tone}`}
            >
              {extra.icon}
              {extra.label}
            </span>
          ) : null}
        </div>

        {/* Polite live region. Nothing that ticks writes here. */}
        <span className="sr-only" role="status" aria-live="polite" data-testid="focus-timer-live">
          {announcement}
        </span>

        {!taskTitle ? (
          // §P17.2 empty state: context + explanation + next action (the action
          // arrives through `footer`). Deliberately neutral — green here would
          // mean "done", and nothing is done.
          <div className="py-12 text-center">
            <div className="mx-auto grid size-11 place-items-center rounded-lg border border-border-control bg-muted text-muted-foreground">
              <Coffee size={20} aria-hidden="true" />
            </div>
            <p className="mt-3 text-headline font-semibold text-foreground">
              No open tasks in today&apos;s queue
            </p>
            <p className="mx-auto mt-1 max-w-sm text-footnote text-muted-foreground">
              Add a task to Today or schedule one from your Inbox to start focusing.
            </p>
          </div>
        ) : (
          <>
            <p className="mt-8 line-clamp-2 font-display text-title3 font-semibold leading-tight text-foreground">
              {taskTitle}
            </p>

            {/* Digits: §P7 type.timer + tabular figures so the readout never jitters. */}
            <div className="mt-6 flex items-baseline justify-between gap-3">
              <span
                data-testid="focus-timer-digits"
                className="font-display text-display3 sm:text-timer tabular-nums text-foreground"
              >
                {readout}
              </span>
              <span className="font-mono text-headline font-bold tabular-nums text-primary-text">
                {percent}%
              </span>
            </div>

            {/* P10: animate transform, never width. origin-left + scaleX keeps this off the layout path. */}
            <div className="mt-3.5 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  'h-full w-full origin-left bg-primary',
                  reducedMotion ? 'transition-none' : 'transition-transform duration-base',
                )}
                style={{ transform: `scaleX(${percent / 100})` }}
              />
            </div>

            <p className="mt-3 text-footnote text-muted-foreground">
              {isFinished
                ? 'This round is logged in today’s review ledger.'
                : isActive
                  ? 'Minutes are saved automatically when you pause or complete.'
                  : state === 'paused'
                    ? 'Paused. Your time is safe and the clock is stopped.'
                    : 'Start the timer when you are ready to begin.'}
            </p>

            {state === 'recovered' ? (
              <div
                data-testid="focus-timer-recovered"
                className="mt-3 flex items-start gap-2 rounded-lg border border-border-control bg-muted px-3 py-2 text-footnote text-foreground"
              >
                <History size={14} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
                <p>
                  Recovered your running round — the clock kept counting while you were away, so the
                  time below is the real elapsed time.
                </p>
              </div>
            ) : null}

            {state === 'sync-failed-but-running' ? (
              <div
                role="alert"
                data-testid="focus-timer-sync-failed"
                className="mt-3 flex items-start gap-2 rounded-lg border border-status-danger-fill/50 bg-status-danger-fill/10 px-3 py-2 text-footnote text-foreground"
              >
                <TriangleAlert
                  size={14}
                  className="mt-0.5 shrink-0 text-status-danger-text"
                  aria-hidden="true"
                />
                <p className="min-w-0 flex-1">
                  {syncError ?? 'Your minutes could not reach the server.'} The timer is still
                  counting and nothing is lost.
                </p>
                {onRetrySync ? (
                  <button
                    type="button"
                    onClick={onRetrySync}
                    data-testid="button-focus-retry-sync"
                    /* Isolated control: the nearest interactive neighbour is >44px away, so an
                       expanded hit area cannot overlap it. min-h-11 makes the box compliant anyway. */
                    className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-md border border-border-control bg-card px-2.5 text-caption font-semibold text-foreground transition-colors [@media(hover:hover)]:hover:bg-muted active:scale-98"
                  >
                    <RotateCcw size={13} aria-hidden="true" />
                    Retry
                  </button>
                ) : null}
              </div>
            ) : null}

            {/* Controls. Every box is >=56px tall (§P11.1), so no hit-area expansion is needed. */}
            <div className="mt-6 flex flex-wrap items-center gap-3">
              {state === 'idle' ? (
                <button
                  type="button"
                  onClick={onStart}
                  disabled={busy || !onStart}
                  aria-busy={busy || undefined}
                  data-testid="button-begin-focus"
                  /* P12 loading: width is reserved with `min-w-40` so swapping the label for
                     "Starting…" cannot shift the row. */
                  className="inline-flex min-h-14 min-w-40 items-center justify-center gap-2 rounded-lg bg-primary px-6 text-footnote font-bold text-primary-foreground shadow-e2 transition-all [@media(hover:hover)]:hover:brightness-105 active:scale-98 disabled:opacity-50"
                >
                  <Play size={16} aria-hidden="true" />
                  {busy ? 'Starting…' : 'Begin focus'}
                </button>
              ) : null}

              {hasRound && state !== 'break' ? (
                <button
                  type="button"
                  onClick={isActive ? onPause : onResume}
                  disabled={busy || (isActive ? !onPause : !onResume)}
                  aria-busy={busy || undefined}
                  data-testid="button-toggle-focus"
                  className="inline-flex min-h-14 items-center gap-2 rounded-lg bg-primary px-6 text-footnote font-bold text-primary-foreground shadow-e2 transition-all [@media(hover:hover)]:hover:brightness-105 active:scale-98 disabled:opacity-50"
                >
                  {isActive ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
                  {isActive ? 'Pause' : 'Resume'}
                </button>
              ) : null}

              {!isFinished ? (
                <button
                  type="button"
                  onClick={onFinish}
                  disabled={busy || !onFinish}
                  aria-busy={busy || undefined}
                  data-testid="button-complete-focus"
                  className="inline-flex min-h-14 items-center gap-2 rounded-lg border border-border-control bg-card px-5 text-body font-medium text-foreground transition-all [@media(hover:hover)]:hover:bg-muted active:scale-98 disabled:opacity-50"
                >
                  <Square size={14} aria-hidden="true" />
                  {state === 'break' ? 'End break' : 'Finish round'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onReset}
                  disabled={!onReset}
                  data-testid="button-new-focus"
                  className="inline-flex min-h-14 items-center gap-2 rounded-lg bg-primary px-6 text-footnote font-bold text-primary-foreground shadow-e2 transition-all [@media(hover:hover)]:hover:brightness-105 active:scale-98 disabled:opacity-50"
                >
                  <RotateCcw size={16} aria-hidden="true" />
                  Start another round
                </button>
              )}

              {/* §P11.1: remaining time is announced on request, never on a timer. */}
              <button
                type="button"
                onClick={readTime}
                data-testid="button-focus-read-time"
                className="inline-flex min-h-14 items-center gap-2 rounded-lg border border-border-control bg-card px-5 text-body font-medium text-foreground transition-all [@media(hover:hover)]:hover:bg-muted active:scale-98"
              >
                <Clock size={16} aria-hidden="true" />
                Read time
              </button>

              {secondaryActions}
            </div>
          </>
        )}

        {footer ? <div className="mt-6 border-t border-border pt-4">{footer}</div> : null}
      </div>
    </section>
  );
}
