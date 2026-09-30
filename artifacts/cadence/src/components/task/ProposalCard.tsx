import { useState } from 'react';
import {
  ArrowRight,
  CalendarPlus,
  Check,
  Hourglass,
  Loader2,
  Pencil,
  ShieldAlert,
  X,
} from 'lucide-react';
import { AITag } from './CadenceDomain';
import type { ReactNode } from 'react';

/**
 * ProposalCard / AutomationBadge — spec P11.1 (ProposalCard, P1).
 *
 * Ask-mode reschedule: the sweep found a forward slot and wrote a proposal
 * instead of moving the task. This card is the whole decision surface, so it
 * carries three non-negotiables without exception:
 *
 *  1. **Approve / Change / Dismiss** are always all three present while the
 *     proposal is open.
 *  2. **A one-line "why"** is always visible — not hidden in a menu and not only
 *     in a tooltip (P11.2: a tooltip is never the only place information lives).
 *  3. **It never auto-acts on expiry.** Expiry is terminal and the card says in
 *     words that nothing moved. This is not decoration: the accept endpoint
 *     flips a stale proposal to `expired` and returns 400 *without* touching
 *     `tasks.due_at` (artifacts/api-server/src/routes/reschedule.ts:80-124), so
 *     the claim is true and the UI must not imply otherwise.
 *
 * Variant mapping. `GET /reschedule/proposals` only ever returns
 * `status = 'pending'` (same file, line 31), so the other four are the outcome of
 * a decision on this card rather than rows the server hands back:
 *   approved / declined  the decision resolved  -> rendered as a receipt
 *   expired              the server closed it without moving the task
 *   failed               the request did not resolve; the proposal is still
 *                        pending, so this variant KEEPS its controls and offers a
 *                        retry rather than pretending the decision is over
 * A resolved decision stays on screen as a receipt instead of a toast that
 * vanishes — that is P3's "automation is never silent" made visible.
 *
 * `tasks.reschedule_count` / `reschedule_settings.max_moves` back the "n of 5"
 * copy (D-03, spec/auto-reschedule-engine.md Rule 5).
 */

export type ProposalVariant = 'proposed' | 'approved' | 'declined' | 'expired' | 'failed';

const VARIANT_CHIP: Record<ProposalVariant, { icon: ReactNode; label: string; className: string }> = {
  proposed: {
    icon: <CalendarPlus size={11} aria-hidden="true" />,
    label: 'Proposed',
    className: 'border-accent/40 bg-accent/10 text-accent',
  },
  approved: {
    icon: <Check size={11} aria-hidden="true" />,
    label: 'Approved',
    className: 'border-border-control bg-muted text-foreground',
  },
  declined: {
    icon: <X size={11} aria-hidden="true" />,
    label: 'Declined',
    className: 'border-border-control bg-muted text-muted-foreground',
  },
  expired: {
    icon: <Hourglass size={11} aria-hidden="true" />,
    label: 'Expired',
    className: 'border-status-warning-text/40 bg-status-warning-fill/10 text-status-warning-text',
  },
  failed: {
    icon: <ShieldAlert size={11} aria-hidden="true" />,
    label: 'Failed',
    className: 'border-destructive/40 bg-destructive/10 text-destructive',
  },
};

/**
 * What each state means for the task. P11.1: a declined or expired proposal
 * must leave the task exactly where it was *and say so*.
 */
const VARIANT_OUTCOME: Record<ProposalVariant, string> = {
  proposed: 'Nothing moves until you choose an action.',
  approved: 'Moved to the new time. This counted as one engine-initiated move.',
  declined: 'You dismissed this. The task keeps the time it had before — change it yourself any time.',
  expired:
    'This proposal timed out and was not applied. The task still has the time it had before — change it yourself any time.',
  failed: 'Nothing was changed. The task still has the time it had before.',
};

// ---------------------------------------------------------------------------
// AutomationBadge — extracted from the inline "Needs attention" chip
// ---------------------------------------------------------------------------

/**
 * P11.1 lists `AITag / AutomationBadge` as one component; AITag already lives in
 * CadenceDomain.tsx and covers the indigo "the engine did this" half. This is
 * the other half: the cap / no-slot flag (Rule 5, D-03), which is a caution
 * state rather than an AI-provenance one, so it gets its own chip.
 *
 * Icon + text always, never colour alone (P6.3). The move count is inside the
 * label because the flag on its own does not say how close the task is to the
 * cap, and the user needs that to decide whether to raise the cap or replan.
 */
export function AutomationBadge({
  moves,
  maxMoves,
  className = '',
}: {
  /** `tasks.reschedule_count` — engine-initiated moves only, never manual edits. */
  moves: number;
  /** `reschedule_settings.max_moves` (default 5, D-03). */
  maxMoves: number;
  className?: string;
}) {
  const atCap = moves >= maxMoves;
  return (
    <span
      data-testid="automation-badge-needs-attention"
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-caption font-bold uppercase tracking-wider ${
        atCap
          ? 'border-destructive/40 bg-destructive/10 text-destructive'
          : 'border-status-warning-text/40 bg-status-warning-fill/10 text-status-warning-text'
      } ${className}`}
    >
      {atCap ? (
        <ShieldAlert size={11} aria-hidden="true" />
      ) : (
        <Hourglass size={11} aria-hidden="true" />
      )}
      Needs attention
      <span className="font-semibold normal-case">
        &mdash; {moves} of {maxMoves} moves
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// ProposalCard
// ---------------------------------------------------------------------------

export interface ProposalCardProps {
  proposalId: number;
  taskId: number;
  /** Falls back to `Task #id` when the task is not in the loaded list. */
  taskTitle: string;
  /** Pre-formatted in the host's timezone — the card must not re-derive timezones. */
  fromLabel: string;
  toLabel: string;
  /** P11.1 "one-line why". Required so it can never be dropped. */
  why: string;
  variant?: ProposalVariant;
  /** `tasks.needs_attention` — renders the cap / no-slot chip. */
  needsAttention?: boolean;
  /** `tasks.reschedule_count`. */
  moves?: number;
  /** `reschedule_settings.max_moves` (default 5). */
  maxMoves?: number;
  onApprove?: () => void;
  onChange?: () => void;
  onDismiss?: () => void;
  /** Removes a settled receipt from the list. */
  onAcknowledge?: () => void;
  busy?: boolean;
  /** Plain-language failure. The host owns the wording (P17.3). */
  error?: string | null;
  className?: string;
}

export function ProposalCard({
  proposalId,
  taskId,
  taskTitle,
  fromLabel,
  toLabel,
  why,
  variant = 'proposed',
  needsAttention = false,
  moves = 0,
  maxMoves = 5,
  onApprove,
  onChange,
  onDismiss,
  onAcknowledge,
  busy = false,
  error = null,
  className = '',
}: ProposalCardProps) {
  const [whyOpen, setWhyOpen] = useState(false);
  const settled = variant !== 'proposed';
  const chip = VARIANT_CHIP[variant];
  // `failed` keeps its controls: the decision never completed, so the user must
  // still be able to retry. Only a decision that actually resolved (approved /
  // declined / expired) replaces the controls with the outcome sentence.
  const decisionOpen = variant === 'proposed' || variant === 'failed';
  const showActions =
    decisionOpen && (Boolean(onApprove) || Boolean(onChange) || Boolean(onDismiss));

  return (
    <article
      data-testid={`proposal-card-${proposalId}`}
      data-task-id={taskId}
      data-proposal-variant={variant}
      aria-labelledby={`proposal-title-${proposalId}`}
      className={`flex flex-col gap-3 rounded-xl border bg-card p-4 md:flex-row md:items-center md:justify-between ${
        decisionOpen ? 'border-accent/40' : 'border-border'
      } ${className}`}
    >
      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {/* P15.3: the engine proposed this, so it carries the AI tag. It stays
              while the decision is open, including after a failed attempt. */}
          {decisionOpen ? (
            <AITag provenance="suggested" onWhy={() => setWhyOpen((open) => !open)} />
          ) : null}
          <span
            data-testid={`proposal-state-${proposalId}`}
            className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-caption font-bold uppercase tracking-wider ${chip.className}`}
          >
            {chip.icon}
            {chip.label}
          </span>
          {needsAttention ? <AutomationBadge moves={moves} maxMoves={maxMoves} /> : null}
        </div>

        <p
          id={`proposal-title-${proposalId}`}
          className="line-clamp-2 text-body font-medium leading-snug text-card-foreground"
        >
          {taskTitle}
        </p>

        {/* old -> new slot. Tabular so the two times line up (P7). The arrow is
            decorative, so the "moved to" connective is carried in text. */}
        <p className="flex flex-wrap items-center gap-1.5 text-footnote text-muted-foreground">
          <span className="line-through">{fromLabel}</span>
          <ArrowRight size={12} aria-hidden="true" />
          <span className="sr-only">moved to</span>
          <span className="font-mono font-bold text-foreground">{toLabel}</span>
        </p>

        {/* P11.1: the "why" is one line and always on screen. */}
        {why.trim().length > 0 ? (
          <p
            data-testid={`proposal-why-${proposalId}`}
            className="text-caption leading-relaxed text-muted-foreground"
          >
            <span className="font-semibold text-foreground">Why:</span> {why}
          </p>
        ) : null}

        {whyOpen ? (
          <div
            data-testid={`proposal-why-detail-${proposalId}`}
            className="space-y-0.5 rounded-lg border border-border bg-muted/40 p-2.5 text-caption leading-relaxed text-muted-foreground"
          >
            {/* P15.1: what the automation deliberately did NOT do. */}
            <p>Fixed events and tasks set to Off are never moved by the sweep, whatever it proposes.</p>
            <p>
              This would be move {moves + 1} of {maxMoves}. Once the cap is reached the task is flagged
              for you instead of being moved again.
            </p>
          </div>
        ) : null}

        {/* P11.1 / Rule 7: the outcome is always spelled out, especially the two
            states where the task was deliberately left alone. */}
        <p data-testid={`proposal-outcome-${proposalId}`} className="text-caption leading-relaxed text-muted-foreground">
          {error ?? VARIANT_OUTCOME[variant]}
        </p>

        {error && decisionOpen ? (
          <p data-testid={`proposal-retry-${proposalId}`} className="text-caption text-muted-foreground">
            The proposal is still waiting on the server, so you can try again.
          </p>
        ) : null}
      </div>

      <div aria-busy={busy || undefined} className="flex shrink-0 flex-wrap items-center gap-1.5">
        {showActions ? (
          <>
            {onApprove ? (
              <button
                type="button"
                onClick={onApprove}
                disabled={busy}
                aria-disabled={busy || undefined}
                data-testid={`proposal-approve-${proposalId}`}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border-control bg-muted px-3 text-caption font-bold text-foreground transition-colors hover:bg-muted/70 disabled:cursor-not-allowed disabled:opacity-50 tap-target-expand"
              >
                {busy ? (
                  <Loader2 size={13} className="animate-spin" aria-hidden="true" />
                ) : (
                  <Check size={13} aria-hidden="true" />
                )}
                Approve
              </button>
            ) : null}

            {onChange ? (
              <button
                type="button"
                onClick={onChange}
                disabled={busy}
                aria-disabled={busy || undefined}
                data-testid={`proposal-change-${proposalId}`}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border-control px-3 text-caption font-semibold text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 tap-target-expand"
              >
                <Pencil size={13} aria-hidden="true" />
                Change
              </button>
            ) : null}

            {onDismiss ? (
              <button
                type="button"
                onClick={onDismiss}
                disabled={busy}
                aria-disabled={busy || undefined}
                data-testid={`proposal-dismiss-${proposalId}`}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-caption font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 tap-target-expand"
              >
                <X size={13} aria-hidden="true" />
                Dismiss
              </button>
            ) : null}
          </>
        ) : null}

        {settled && onAcknowledge ? (
          <button
            type="button"
            onClick={onAcknowledge}
            data-testid={`proposal-ack-${proposalId}`}
            className="inline-flex min-h-9 items-center rounded-lg border border-border-control px-3 text-caption font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground tap-target-expand"
          >
            Got it
          </button>
        ) : null}
      </div>
    </article>
  );
}
