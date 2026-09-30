import { useId, useState } from 'react';
import {
  CalendarPlus,
  CheckCircle2,
  ChevronDown,
  CloudOff,
  Hourglass,
  Info,
  Loader2,
  Pencil,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Square,
  TriangleAlert,
  Undo2,
  Wrench,
  X,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { AITag, type AIProvenance } from '@/components/task/CadenceDomain';

/**
 * AgentActionCard — docs/13-master-design-system-prompt.md §P15.1 / §P15.2.
 *
 * The single card surface for every AI or automation action. §P15.1 is
 * unusually specific and every clause is enforced here as a REQUIRED prop or a
 * rendered row, so an action card cannot ship without them:
 *
 *   1. verb + object count      -> `verb` + `objectCount` + `objectNoun`
 *   2. what changed             -> `changes`
 *   3. what was NOT changed     -> `notChanged` (required, never optional)
 *   4. data used                -> `dataUsed`  (required, never optional)
 *   5. status                   -> `state` (+ `stateDetail`)
 *   6. controls + Why?          -> `onUndo` / `onEdit` / `onApprove` / `why`
 *
 * Spec layout being matched:
 *
 *   ┌ ✦ Agent · Rescheduled 4 tasks                    ● Done · 14:02
 *   │ Moved: "PS1 writeup" -> Thu 3-4pm  · (+3 more)          [Details ▾]
 *   │ Not changed: 2 fixed events · 1 task set to Off
 *   │ Used: Tasks · Calendar · 2 memory facts
 *   └ [Undo]   [Why?]
 *
 * §P15.3 non-negotiables encoded here:
 *  - Neutral glyph + `AITag` on every AI-caused item. `AITag` is REUSED from
 *    CadenceDomain.tsx, never re-implemented. Callers pass `provenance={null}`
 *    for a user-made item, which renders no tag at all.
 *  - Anti-anthropomorphism: no name, no avatar, no claimed feelings or intent,
 *    plain verbs supplied by the caller, no first person in any UI copy here.
 *  - Never colour-alone (§P6.3, §P12): every state ships icon + text label.
 *
 * DATA-HONESTY NOTE: the card renders exactly what it is given and never invents
 * provenance. `notChanged` and `dataUsed` are required so §P15.1 cannot be
 * silently skipped; when the caller has no recorded value it must pass an
 * explicit "not recorded" entry rather than leaving the row out.
 */

export type AgentActionState =
  | 'thinking'
  | 'tool-running'
  | 'awaiting-approval'
  | 'executed'
  | 'partial-failure'
  | 'failed'
  | 'undone'
  | 'queued'
  | 'blocked'
  | 'offline';

// ---------------------------------------------------------------------------
// §P15.2 state -> presentation. Icon + label + semantic colour, never colour
// alone (§P6.3). `live` follows §P17.1: errors announce assertively, everything
// else politely.
// ---------------------------------------------------------------------------

const STATE_PRESENTATION: Record<
  AgentActionState,
  { icon: ReactNode; label: string; className: string; live: 'polite' | 'assertive' }
> = {
  thinking: {
    icon: <Loader2 size={12} className="animate-spin" aria-hidden="true" />,
    label: 'Thinking',
    className: 'text-ai-text',
    live: 'polite',
  },
  'tool-running': {
    icon: <Wrench size={12} aria-hidden="true" />,
    label: 'Running',
    className: 'text-ai-text',
    live: 'polite',
  },
  'awaiting-approval': {
    icon: <CalendarPlus size={12} aria-hidden="true" />,
    label: 'Awaiting approval',
    className: 'text-accent',
    live: 'polite',
  },
  executed: {
    icon: <CheckCircle2 size={12} aria-hidden="true" />,
    label: 'Done',
    className: 'text-success',
    live: 'polite',
  },
  'partial-failure': {
    icon: <TriangleAlert size={12} aria-hidden="true" />,
    label: 'Partly done',
    className: 'text-status-warning-text',
    live: 'assertive',
  },
  failed: {
    icon: <TriangleAlert size={12} aria-hidden="true" />,
    label: 'Failed',
    className: 'text-destructive',
    live: 'assertive',
  },
  undone: {
    icon: <Undo2 size={12} aria-hidden="true" />,
    label: 'Undone',
    className: 'text-muted-foreground',
    live: 'polite',
  },
  queued: {
    icon: <Hourglass size={12} aria-hidden="true" />,
    label: 'Queued',
    className: 'text-status-warning-text',
    live: 'polite',
  },
  blocked: {
    icon: <ShieldAlert size={12} aria-hidden="true" />,
    label: 'Not performed',
    className: 'text-status-warning-text',
    live: 'assertive',
  },
  offline: {
    icon: <CloudOff size={12} aria-hidden="true" />,
    label: 'Offline',
    className: 'text-muted-foreground',
    live: 'polite',
  },
};

/** P15.1 element 2 — one row of "what changed". */
export interface AgentActionChange {
  id: string;
  /** The object that changed, verbatim enough to identify it ("PS1 writeup"). */
  object: string;
  /** Prior value; null/absent when there was none (a created task). */
  from?: string | null;
  /** New value; null/absent when the value was cleared. */
  to?: string | null;
  /** Optional extra qualifier, e.g. "move 2 of 5". */
  note?: string | null;
}

/** P15.2 partial failure — which items succeeded and which failed, with reasons. */
export interface AgentActionOutcome {
  id: string;
  object: string;
  ok: boolean;
  reason?: string | null;
}

export interface AgentActionCardProps {
  /** P15.1 (1). Plain past-tense verb. No intent, no feeling ("Rescheduled"). */
  verb: string;
  /** P15.1 (1). */
  objectCount: number;
  /** P15.1 (1). Explicit singular/plural so the card never guesses pluralisation. */
  objectNoun: { one: string; many: string };
  /** P15.1 (2). */
  changes: AgentActionChange[];
  /** P15.1 (3). REQUIRED. What the action deliberately left alone. */
  notChanged: string[];
  /** P15.1 (4). REQUIRED. Which data the action read. */
  dataUsed: string[];
  /** P15.1 (5). Drives icon + label + live-region politeness. */
  state: AgentActionState;
  /**
   * Escape hatch for the pre-action states (thinking / tool running), where there
   * is no verb-and-count yet because nothing has changed. When set, it replaces
   * the generated "verb N noun" line. Omit it for any real action so P15.1 (1)
   * always renders.
   */
  headline?: string | null;
  /** P15.1 (5). The time/detail shown after the state label ("14:02"). */
  stateDetail?: string | null;
  /** P15.1 (2). Verb for the change row ("Moved", "Created", "Completed"). */
  changeVerb?: string;
  /** P15.2 thinking / tool-running. The NAMED step. Never a progress bar. */
  step?: string | null;
  /** P15.2 failed. Plain-language reason (§P17.3: no stack traces, no raw errors). */
  failureReason?: string | null;
  /** P15.2 failed. What state things are in — defaults to "Nothing was changed." */
  stateAfterFailure?: string | null;
  /** P15.2 partial failure. Per-item success/failure with reasons. */
  outcomes?: AgentActionOutcome[];
  /** P15.2 blocked/unsafe. Defaults to "This request was not performed." */
  blockedNotice?: string | null;
  /** P15.1 (6) + P15.2. Short plain-language explanation behind "Why?". */
  why?: string | null;
  /** P15.3 provenance. `null` renders no AITag — correct for user-made items. */
  provenance?: AIProvenance | null;
  /** P15.2 undone. The undo timestamp, when the source records one. */
  undoneAt?: string | null;
  /** P15.2 fallback provider used: silent in the flow, visible in Details. */
  fallbackProvider?: string | null;

  /** P15.1 (6) / P15.2 controls. A control is only rendered when its handler exists. */
  onUndo?: () => void;
  onEdit?: () => void;
  onApprove?: () => void;
  onRetry?: () => void;
  onStop?: () => void;
  onCancel?: () => void;

  /** Custom labels for callers whose verb differs (e.g. "Undo move"). */
  labels?: Partial<Record<'undo' | 'edit' | 'approve' | 'retry' | 'stop' | 'cancel', string>>;

  /** P12 loading: preserves control width, blocks duplicate submits, sets aria-busy. */
  busy?: boolean;
  /** P12 disabled-is-never-silent: the reason a control is unavailable. */
  busyReason?: string | null;
  className?: string;
}

const CONTROL =
  'inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border-control bg-card px-3 text-footnote font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 tap-target-expand';

const CONTROL_PRIMARY =
  'inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-ai bg-ai px-3 text-footnote font-bold text-primary-foreground transition-colors hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 tap-target-expand';

const DETAIL_ROW = 'flex items-start gap-1.5 text-caption leading-relaxed text-muted-foreground';

function Dots({ items, empty }: { items: string[]; empty: string }) {
  if (items.length === 0) {
    return <span className="text-muted-foreground">{empty}</span>;
  }
  return (
    <>
      {items.map((item, i) => (
        <span key={`${item}-${i}`}>
          {i > 0 ? <span aria-hidden="true"> · </span> : null}
          {item}
        </span>
      ))}
    </>
  );
}

export function AgentActionCard({
  verb,
  objectCount,
  objectNoun,
  changes,
  notChanged,
  dataUsed,
  state,
  stateDetail = null,
  headline = null,
  changeVerb = 'Changed',
  step = null,
  failureReason = null,
  stateAfterFailure = null,
  outcomes,
  blockedNotice = null,
  why = null,
  provenance = 'agent',
  undoneAt = null,
  fallbackProvider = null,
  onUndo,
  onEdit,
  onApprove,
  onRetry,
  onStop,
  onCancel,
  labels,
  busy = false,
  busyReason = null,
  className = '',
}: AgentActionCardProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [whyOpen, setWhyOpen] = useState(false);
  const detailsId = useId();
  const whyId = useId();

  const p = STATE_PRESENTATION[state];
  const liveRole = p.live === 'assertive' ? 'alert' : 'status';
  const noun = objectCount === 1 ? objectNoun.one : objectNoun.many;
  const firstChange = changes[0];
  const remaining = Math.max(0, changes.length - 1);
  const hasDetails = changes.length > 1 || Boolean(fallbackProvider);
  const label = (key: 'undo' | 'edit' | 'approve' | 'retry' | 'stop' | 'cancel', fallback: string) =>
    labels?.[key] ?? fallback;

  const succeeded = (outcomes ?? []).filter((o) => o.ok);
  const failedOutcomes = (outcomes ?? []).filter((o) => !o.ok);

  // Which controls belong to which state (§P15.2 control column). A control is
  // rendered only when the caller supplied a handler, so the card can never
  // offer an action the surface cannot actually perform.
  const controls: ReactNode[] = [];

  if (state === 'thinking' && onStop) {
    controls.push(
      <button
        key="stop"
        type="button"
        onClick={onStop}
        disabled={busy}
        aria-busy={busy || undefined}
        className={CONTROL}
        data-testid="agent-action-stop"
      >
        <Square size={12} aria-hidden="true" />
        {label('stop', 'Stop')}
      </button>,
    );
  }

  if (state === 'tool-running' && onCancel) {
    controls.push(
      <button
        key="cancel"
        type="button"
        onClick={onCancel}
        disabled={busy}
        aria-busy={busy || undefined}
        className={CONTROL}
        data-testid="agent-action-cancel"
      >
        <X size={12} aria-hidden="true" />
        {label('cancel', 'Cancel')}
      </button>,
    );
  }

  if (state === 'awaiting-approval' && onApprove) {
    controls.push(
      <button
        key="approve"
        type="button"
        onClick={onApprove}
        disabled={busy}
        aria-busy={busy || undefined}
        className={CONTROL_PRIMARY}
        data-testid="agent-action-approve"
      >
        <CheckCircle2 size={12} aria-hidden="true" />
        {label('approve', 'Approve')}
      </button>,
    );
  }

  if (state === 'executed' && onUndo) {
    controls.push(
      <button
        key="undo"
        type="button"
        onClick={onUndo}
        disabled={busy}
        aria-busy={busy || undefined}
        className={CONTROL}
        data-testid="agent-action-undo"
      >
        <Undo2 size={12} aria-hidden="true" />
        {label('undo', 'Undo')}
      </button>,
    );
  }

  // P15.2 partial failure: undo what succeeded, retry what failed.
  if (state === 'partial-failure') {
    if (onUndo && succeeded.length > 0) {
      controls.push(
        <button
          key="undo"
          type="button"
          onClick={onUndo}
          disabled={busy}
          aria-busy={busy || undefined}
          className={CONTROL}
          data-testid="agent-action-undo"
        >
          <Undo2 size={12} aria-hidden="true" />
          {label('undo', `Undo ${succeeded.length} that worked`)}
        </button>,
      );
    }
    if (onRetry && failedOutcomes.length > 0) {
      controls.push(
        <button
          key="retry"
          type="button"
          onClick={onRetry}
          disabled={busy}
          aria-busy={busy || undefined}
          className={CONTROL}
          data-testid="agent-action-retry"
        >
          <RotateCcw size={12} aria-hidden="true" />
          {label('retry', `Retry ${failedOutcomes.length} that failed`)}
        </button>,
      );
    }
  }

  if (state === 'failed' && onRetry) {
    controls.push(
      <button
        key="retry"
        type="button"
        onClick={onRetry}
        disabled={busy}
        aria-busy={busy || undefined}
        className={CONTROL}
        data-testid="agent-action-retry"
      >
        <RotateCcw size={12} aria-hidden="true" />
        {label('retry', 'Retry')}
      </button>,
    );
  }

  if ((state === 'failed' || state === 'blocked') && onEdit) {
    controls.push(
      <button
        key="edit"
        type="button"
        onClick={onEdit}
        disabled={busy}
        aria-busy={busy || undefined}
        className={CONTROL}
        data-testid="agent-action-edit"
      >
        <Pencil size={12} aria-hidden="true" />
        {label('edit', 'Edit request')}
      </button>,
    );
  }

  if (state === 'queued' && onCancel) {
    controls.push(
      <button
        key="cancel-queued"
        type="button"
        onClick={onCancel}
        disabled={busy}
        aria-busy={busy || undefined}
        className={CONTROL}
        data-testid="agent-action-cancel"
      >
        <X size={12} aria-hidden="true" />
        {label('cancel', 'Cancel')}
      </button>,
    );
  }

  // P15.1 (6) — "Why?" is on every card that can explain itself.
  const whyControl =
    why && !why.trim() ? null : why ? (
      <button
        type="button"
        onClick={() => setWhyOpen((v) => !v)}
        aria-expanded={whyOpen}
        aria-controls={whyId}
        data-testid="agent-action-why-toggle"
        className={CONTROL}
      >
        <Info size={12} aria-hidden="true" />
        Why?
      </button>
    ) : null;

  return (
    <article
      data-testid="agent-action-card"
      data-state={state}
      className={`rounded-xl border border-ai/30 bg-card p-3.5 text-card-foreground ${className}`}
    >
      {/* (1) verb + object count, and (5) status ------------------------------ */}
      <header className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
          {/* P15.3 neutral glyph, no avatar, no human name. */}
          <SparklesGlyph />
          {/* P15.3 provenance everywhere. User-made items pass null -> no tag. */}
          {provenance ? <AITag provenance={provenance} /> : null}
          <h3 className="text-footnote font-semibold leading-snug text-foreground">
            {headline ?? `${verb} ${objectCount} ${noun}`}
          </h3>
        </div>
        <p
          className={`inline-flex shrink-0 items-center gap-1 text-caption ${p.className}`}
          data-testid="agent-action-state"
          role={liveRole}
          aria-live={p.live}
        >
          {p.icon}
          <span>{p.label}</span>
          {stateDetail ? <span className="text-muted-foreground">· {stateDetail}</span> : null}
        </p>
      </header>

      {/* P15.2 per-state notice body ---------------------------------------- */}
      {state === 'thinking' || state === 'tool-running' ? (
        <p
          className="mt-2 flex items-center gap-1.5 text-footnote text-foreground"
          data-testid="agent-action-step"
        >
          {/* §P15.2: a named step. Deliberately no progress bar — a bar we cannot
              honestly fill is a fake progress bar. */}
          <Loader2 size={13} className="shrink-0 animate-spin text-ai-text" aria-hidden="true" />
          <span>{step ?? 'Reading your tasks and calendar…'}</span>
        </p>
      ) : null}

      {state === 'queued' ? (
        <p
          className="mt-2 text-footnote leading-relaxed text-foreground"
          data-testid="agent-action-queued"
        >
          The assistant is busy and retrying. Your request is queued — everything else in the app
          keeps working.
        </p>
      ) : null}

      {state === 'offline' ? (
        <p
          className="mt-2 text-footnote leading-relaxed text-foreground"
          data-testid="agent-action-offline"
        >
          The assistant is unavailable while you are offline. Your tasks, calendar, and focus
          rounds all keep working — nothing here needs the assistant.
        </p>
      ) : null}

      {state === 'blocked' ? (
        <div className="mt-2" data-testid="agent-action-blocked">
          <p className="text-footnote font-semibold leading-relaxed text-foreground">
            {blockedNotice ?? 'This request was not performed.'}
          </p>
          {failureReason ? (
            <p className="mt-0.5 text-caption leading-relaxed text-muted-foreground">
              {failureReason}
            </p>
          ) : null}
          <p className="mt-0.5 text-caption leading-relaxed text-muted-foreground">
            Nothing was changed.
          </p>
        </div>
      ) : null}

      {state === 'failed' ? (
        <div className="mt-2" data-testid="agent-action-failed">
          <p className="text-footnote font-semibold leading-relaxed text-foreground">
            {failureReason ?? 'The request could not be completed.'}
          </p>
          <p className="mt-0.5 text-caption leading-relaxed text-muted-foreground">
            {stateAfterFailure ?? 'Nothing was changed.'}
          </p>
        </div>
      ) : null}

      {state === 'partial-failure' ? (
        <div className="mt-2" data-testid="agent-action-outcomes">
          <p className="text-caption font-semibold uppercase tracking-wider text-muted-foreground">
            Partly applied
          </p>
          <ul className="mt-1 space-y-1">
            {succeeded.map((o) => (
              <li key={`ok-${o.id}`} className={DETAIL_ROW} data-testid="agent-action-outcome-ok">
                <CheckCircle2 size={12} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="font-semibold text-foreground">{o.object}</span> — done
                </span>
              </li>
            ))}
            {failedOutcomes.map((o) => (
              <li
                key={`fail-${o.id}`}
                className={DETAIL_ROW}
                data-testid="agent-action-outcome-failed"
              >
                <TriangleAlert
                  size={12}
                  className="mt-0.5 shrink-0 text-status-warning-text"
                  aria-hidden="true"
                />
                <span className="min-w-0">
                  <span className="font-semibold text-foreground">{o.object}</span> —{' '}
                  {o.reason ?? 'did not complete'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {state === 'undone' ? (
        <p className="mt-2 text-caption leading-relaxed text-muted-foreground" data-testid="agent-action-undone">
          {undoneAt
            ? `Undone at ${undoneAt}. The original entry is kept in the log.`
            : stateDetail
              ? // No `undoneAt` from the source: name `stateDetail` for what it
                // actually is rather than mislabelling it as the undo time.
                `Undone. This change was recorded at ${stateDetail}; the original entry is kept in the log.`
              : 'Undone. The original entry is kept in the log.'}
        </p>
      ) : null}

      {/* (2) what changed ---------------------------------------------------- */}
      {firstChange ? (
        <div className="mt-2">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 text-caption leading-relaxed text-muted-foreground">
              <span className="font-semibold text-foreground">{changeVerb}:</span>{' '}
              {describeChange(firstChange)}
              {/* P8.3 overflow collapse. The Details control below is the only
                  interactive affordance — no duplicate expand target. */}
              {!detailsOpen && remaining > 0 ? (
                <span className="text-muted-foreground"> · (+{remaining} more)</span>
              ) : null}
            </p>
            {hasDetails ? (
              <button
                type="button"
                onClick={() => setDetailsOpen((v) => !v)}
                aria-expanded={detailsOpen}
                aria-controls={detailsId}
                data-testid="agent-action-details-toggle"
                className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-md px-1.5 text-caption font-semibold text-accent transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent tap-target-expand"
              >
                Details
                <ChevronDown
                  size={12}
                  className={detailsOpen ? 'rotate-180 transition-transform' : 'transition-transform'}
                  aria-hidden="true"
                />
              </button>
            ) : null}
          </div>

          {detailsOpen ? (
            <div id={detailsId} className="mt-1.5 space-y-1" data-testid="agent-action-details">
              {changes.slice(1).map((c) => (
                <p key={c.id} className={DETAIL_ROW}>
                  <span className="shrink-0 font-semibold text-foreground">{c.object}</span>
                  <span className="min-w-0">
                    {describeTransition(c) ? ` — ${describeTransition(c)}` : null}
                  </span>
                </p>
              ))}
              {/* P15.2 fallback provider: silent in the flow, visible in Details. */}
              {fallbackProvider ? (
                <p className={DETAIL_ROW} data-testid="agent-action-fallback-provider">
                  <Info size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
                  <span>
                    Answered by {fallbackProvider}, a fallback provider. No other provider was
                    available.
                  </span>
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* (3) what was deliberately NOT changed, and (4) data used ------------- */}
      <div className="mt-1.5 space-y-1">
        <p className={DETAIL_ROW} data-testid="agent-action-not-changed">
          <span className="shrink-0 font-semibold text-foreground">Not changed:</span>
          <span className="min-w-0">
            <Dots items={notChanged} empty="nothing else" />
          </span>
        </p>
        <p className={DETAIL_ROW} data-testid="agent-action-data-used">
          <span className="shrink-0 font-semibold text-foreground">Used:</span>
          <span className="min-w-0">
            <Dots items={dataUsed} empty="not recorded for this action" />
          </span>
        </p>
      </div>

      {/* (6) controls + Why? ------------------------------------------------- */}
      {whyOpen && why ? (
        <p
          id={whyId}
          className="mt-2 rounded-lg border border-border-subtle bg-muted px-2.5 py-2 text-caption leading-relaxed text-foreground"
          data-testid="agent-action-why"
        >
          {why}
        </p>
      ) : null}

      {controls.length > 0 || whyControl ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-border-subtle pt-2">
          {controls}
          {whyControl}
        </div>
      ) : null}

      {/* P12: disabled is never silent. Rendered from `busyReason` alone, so a
          caller can explain an in-flight request without also disabling Stop. */}
      {busyReason ? (
        <p className="mt-1.5 text-caption text-muted-foreground" data-testid="agent-action-busy-reason">
          {busyReason}
        </p>
      ) : null}
    </article>
  );
}

/** `"PS1 writeup" from Tue 2 Nov 9:00 AM to Thu 4 Nov 3:00 PM` — the one-line summary. */
function describeChange(change: AgentActionChange): string {
  const parts = [`"${change.object}"`];
  const transition = describeTransition(change);
  if (transition) parts.push(transition);
  if (change.note) parts.push(`(${change.note})`);
  return parts.join(' ');
}

/** `from Tue 2 Nov 9:00 AM to Thu 4 Nov 3:00 PM`, or `to Thu 4 Nov 3:00 PM`. */
function describeTransition(change: AgentActionChange): string {
  if (change.from && change.to) return `from ${change.from} to ${change.to}`;
  if (change.to) return `to ${change.to}`;
  if (change.from) return `from ${change.from}`;
  return '';
}

/** P15.3 neutral glyph. Sparkles, not a face. */
function SparklesGlyph() {
  return (
    <span className="inline-flex shrink-0 items-center text-ai-text" aria-hidden="true">
      <Sparkles size={12} strokeWidth={1.75} />
    </span>
  );
}
