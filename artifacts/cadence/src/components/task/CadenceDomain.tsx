import { CalendarClock, CheckCircle2, Clock, Flag, Lock, Pause, Play, Sparkles, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * P0 domain components from docs/13-master-design-system-prompt.md §P11.1.
 *
 * These were previously inline JSX scattered across pages, which §P4 explicitly
 * forbids ("A page may not define its own button, card, chip, or sheet"). They are
 * extracted here with the states and non-negotiables §P11.1 requires.
 *
 * Every status is icon + text label + semantic colour. Colour is never the sole
 * carrier of meaning (§P6.3, WCAG 1.4.1).
 */

// ---------------------------------------------------------------------------
// AITag — "anything the agent or automation did" (§P15.3 provenance)
// ---------------------------------------------------------------------------

export type AIProvenance = 'agent' | 'auto-moved' | 'suggested';

const AI_LABEL: Record<AIProvenance, string> = {
  agent: 'Agent',
  'auto-moved': 'Auto-moved',
  suggested: 'Suggested',
};

const AI_ICON: Record<AIProvenance, ReactNode> = {
  agent: <Sparkles size={11} aria-hidden="true" />,
  'auto-moved': <CalendarClock size={11} aria-hidden="true" />,
  suggested: <Sparkles size={11} aria-hidden="true" />,
};

export function AITag({
  provenance,
  onWhy,
  className = '',
}: {
  provenance: AIProvenance;
  /** P11.1: "focus (opens the Why popover)". P15.1: every AI action must be explainable. */
  onWhy?: () => void;
  className?: string;
}) {
  const label = AI_LABEL[provenance];
  return (
    <span
      data-testid={`ai-tag-${provenance}`}
      className={`inline-flex items-center gap-1 rounded-full border border-ai/30 bg-ai-tint px-1.5 py-0.5 font-mono text-caption font-semibold uppercase tracking-wider text-ai-text ${className}`}
    >
      {AI_ICON[provenance]}
      {label}
      {onWhy ? (
        <button
          type="button"
          onClick={onWhy}
          className="ml-0.5 underline underline-offset-2 hover:opacity-80 tap-target-expand"
          aria-label={`Why was this ${label.toLowerCase()}?`}
        >
          Why?
        </button>
      ) : null}
    </span>
  );
}

// ---------------------------------------------------------------------------
// StatusIndicator — §P9 icon table + §P6.3 never-colour-alone
// ---------------------------------------------------------------------------

export type TaskStatus = 'done' | 'overdue' | 'scheduled' | 'running' | 'paused' | 'needs-attention' | 'fixed';

const STATUS: Record<TaskStatus, { icon: ReactNode; label: string; className: string }> = {
  done: { icon: <CheckCircle2 size={12} aria-hidden="true" />, label: 'Done', className: 'text-success' },
  overdue: { icon: <TriangleAlert size={12} aria-hidden="true" />, label: 'Overdue', className: 'text-destructive' },
  scheduled: { icon: <Clock size={12} aria-hidden="true" />, label: 'Scheduled', className: 'text-accent' },
  running: { icon: <Play size={12} aria-hidden="true" />, label: 'Running', className: 'text-primary-text' },
  paused: { icon: <Pause size={12} aria-hidden="true" />, label: 'Paused', className: 'text-muted-foreground' },
  'needs-attention': { icon: <Flag size={12} aria-hidden="true" />, label: 'Needs attention', className: 'text-status-warning-text' },
  fixed: { icon: <Lock size={12} aria-hidden="true" />, label: 'Fixed', className: 'text-muted-foreground' },
};

export function StatusIndicator({
  status,
  timeText,
  className = '',
}: {
  status: TaskStatus;
  /** P9: scheduled/running always pair with the time text. */
  timeText?: string;
  className?: string;
}) {
  const s = STATUS[status];
  return (
    <span className={`inline-flex items-center gap-1 text-caption ${s.className} ${className}`}>
      {s.icon}
      <span>{s.label}</span>
      {timeText ? <span className="text-muted-foreground">{timeText}</span> : null}
    </span>
  );
}

// ---------------------------------------------------------------------------
// NextUpCard — Today's hero. §P11.1: the single most prominent element on Today.
// One tap starts a focus round. Min height 72.
// ---------------------------------------------------------------------------

export interface NextUpTask {
  id: string;
  title: string;
  durationMin?: number | null;
  roundNumber?: number | null;
  roundTarget?: number | null;
  provenance?: AIProvenance | null;
  needsAttention?: boolean;
}

export function NextUpCard({
  task,
  onStart,
  busy = false,
  error,
  onRetry,
}: {
  task: NextUpTask | null;
  onStart: (task: NextUpTask) => void;
  busy?: boolean;
  error?: string | null;
  onRetry?: () => void;
}) {
  // no-task variant: §P11.1 "pick from backlog / capture"
  if (!task) {
    return (
      <section
        aria-labelledby="next-up-heading"
        data-testid="card-next-task"
        className="rounded-xl border border-border bg-card/60 p-4"
      >
        <div className="mb-1.5 flex items-center gap-1.5">
          <Play size={14} className="text-muted-foreground" aria-hidden="true" />
          <h2 id="next-up-heading" className="font-mono text-caption font-semibold uppercase tracking-widest text-muted-foreground">
            Next Up
          </h2>
        </div>
        <p className="text-footnote leading-relaxed text-muted-foreground">
          Nothing queued right now. Add a task to give your next hour a clear focus target.
        </p>
      </section>
    );
  }

  const disabled = busy;

  return (
    <section
      aria-labelledby="next-up-heading"
      data-testid="card-next-task"
      className="relative overflow-hidden rounded-xl border border-border bg-card p-4 shadow-lg"
    >
      <div className="mb-2 flex items-center justify-between">
        <h2
          id="next-up-heading"
          className="inline-flex items-center gap-1.5 font-mono text-caption font-bold uppercase tracking-widest text-primary-text"
        >
          <Play size={14} aria-hidden="true" />
          Next Up
        </h2>
        <span className="flex items-center gap-1.5 font-mono text-caption uppercase text-muted-foreground">
          <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
          Queued
        </span>
      </div>

      <p className="line-clamp-2 text-headline font-semibold leading-snug text-card-foreground">{task.title}</p>

      {task.provenance ? (
        <div className="mt-2">
          <AITag provenance={task.provenance} />
        </div>
      ) : null}

      {/* P12: disabled is never silent — the reason is always discoverable */}
      {disabled ? (
        <p className="mt-2 text-caption text-muted-foreground">
          {error ?? 'Starting your focus round…'}
        </p>
      ) : null}

      {error && !busy && onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          data-testid="button-next-up-retry"
          className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border-control px-2.5 text-caption font-semibold hover:bg-muted tap-target-expand"
        >
          <TriangleAlert size={12} aria-hidden="true" />
          Retry
        </button>
      ) : null}

      <div className="mt-3 flex items-center justify-between border-t border-border pt-2.5">
        <span className="inline-flex items-center gap-1.5 font-mono text-caption text-muted-foreground">
          <Clock size={12} aria-hidden="true" />
          {task.durationMin || 25} min
          {task.roundNumber && task.roundTarget ? (
            <span className="text-muted-foreground">
              · round {task.roundNumber} of {task.roundTarget}
            </span>
          ) : null}
        </span>

        <button
          type="button"
          onClick={() => onStart(task)}
          disabled={disabled}
          aria-busy={busy || undefined}
          data-testid="button-start-focus"
          className="btn-primary inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-footnote font-bold text-primary-foreground transition-all active:scale-95 disabled:opacity-50"
        >
          {busy ? 'Starting…' : 'Start focus'}
          <Play size={12} strokeWidth={2.5} aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
