import { useId, useState } from 'react';
import {
  CalendarPlus,
  Check,
  ChevronDown,
  Info,
  Loader2,
  Lock,
  Pencil,
  TriangleAlert,
  X,
} from 'lucide-react';
import { AITag } from '@/components/task/CadenceDomain';

/**
 * ActionPreview — docs/13-master-design-system-prompt.md §P15.2 (Awaiting
 * approval) and §P1 / §P13 (bulk-confirm threshold).
 *
 * This is the surface the user sees BEFORE an agent action touches anything. It
 * exists because the product's core promise is "automation is never silent"
 * (§P3): every proposed change is listed, the blast radius is stated as a
 * number, and nothing happens until the user confirms.
 *
 * THE >10 RULE. §P1 locks it in ("actions touching >10 tasks require explicit
 * confirm") and §P15.2 repeats it (">10 tasks = explicit Confirm required").
 * Handled here as three things at once, so the threshold is unmissable:
 *   1. The count is always rendered ABOVE the list and above the controls, so it
 *      is visible before confirming rather than after.
 *   2. Past the threshold a dedicated callout names the threshold and the count.
 *   3. The confirm button is always worded with the specific verb and the real
 *      count ("Reschedule 12 tasks"), per §P13's "never OK" rule. It is never a
 *      bare "Confirm" and never a generic dialog button.
 *
 * The threshold is evaluated against the EFFECTIVE list — items the user has
 * unticked are excluded from the count, so dropping from 12 to 9 changes both
 * the notice and the button label before the user commits.
 *
 * Fixed/immovable items are listed but cannot be excluded or applied
 * (auto-reschedule Rule 1: never move a fixed event). The row says so, which is
 * §P12's "disabled is never silent".
 *
 * Like AgentActionCard, this component renders only what it is given. It never
 * invents a change list: if the caller cannot describe the changes, pass
 * `unavailableReason` and the surface degrades to the §P17.3 "AI error" pattern
 * (plain reason + "Nothing was changed." + a disabled-with-reason Confirm).
 */

/** §P1 / §P13 / §P15.2. Exported so callers and tests share one number. */
export const BULK_CONFIRM_THRESHOLD = 10;

export type ActionPreviewKind = 'move' | 'create' | 'edit' | 'complete' | 'archive';

export interface ActionPreviewChange {
  id: string;
  /** Verbatim enough to identify the object before approving. */
  title: string;
  /** Prior value. */
  from?: string | null;
  /** New value. */
  to?: string | null;
  kind: ActionPreviewKind;
  note?: string | null;
  /** Fixed/immovable: listed for completeness, never applied, never excludable. */
  fixed?: boolean;
  /**
   * Replaces the default "Fixed — cannot be moved" row label so the reason matches
   * why the item is immovable (e.g. a task whose automation is `off`).
   */
  fixedLabel?: string;
}

export interface ActionPreviewProps {
  /** Plain infinitive verb, e.g. "Reschedule". Used in the count line and button. */
  verb: string;
  changes: ActionPreviewChange[];
  /** P15.1 (3). What this action will deliberately leave alone. */
  notChanged: string[];
  /** P15.1 (4). Which data this action read to build the proposal. */
  dataUsed: string[];
  /** P15.1 (6). Plain-language explanation behind "Why?". */
  why?: string | null;

  /** Receives the EFFECTIVE list, i.e. after the user's exclusions. */
  onConfirm: (changes: ActionPreviewChange[]) => void;
  onEdit?: () => void;
  onCancel: () => void;

  /**
   * P12 loading: preserves control width, blocks duplicate submits, aria-busy.
   */
  busy?: boolean;
  /**
   * When the agent required confirmation but did not describe the changes, this
   * explains why in plain language. Confirm is then disabled with a visible
   * reason and nothing is presented as pending.
   */
  unavailableReason?: string | null;
  /**
   * P12 disabled-with-reason: an additional reason Confirm is unavailable, for
   * callers that have no way to execute a confirmation yet. Rendered verbatim
   * under the controls so the block is never silent.
   */
  confirmDisabledReason?: string | null;
  /** Overridable so a future contract change is a one-line edit, not a fork. */
  threshold?: number;
  className?: string;
}

const CONTROL =
  'inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border-control bg-card px-3 text-footnote font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 tap-target-expand';

const CONTROL_PRIMARY =
  'inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-ai bg-ai px-3 text-footnote font-bold text-primary-foreground transition-colors hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 tap-target-expand';

const KIND_LABEL: Record<ActionPreviewKind, string> = {
  move: 'Move',
  create: 'Create',
  edit: 'Edit',
  complete: 'Complete',
  archive: 'Archive',
};

export function ActionPreview({
  verb,
  changes,
  notChanged,
  dataUsed,
  why = null,
  onConfirm,
  onEdit,
  onCancel,
  busy = false,
  unavailableReason = null,
  confirmDisabledReason = null,
  threshold = BULK_CONFIRM_THRESHOLD,
  className = '',
}: ActionPreviewProps) {
  const headingId = useId();
  const listId = useId();
  const whyId = useId();
  // Ids the user has unticked. `fixed` items are never removable, so they never
  // appear here even if the id is somehow supplied.
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(() => new Set<string>());

  const [whyOpen, setWhyOpen] = useState(false);

  const unavailable = Boolean(unavailableReason);
  const effective = changes.filter((c) => !c.fixed && !excluded.has(c.id));
  const skipped = changes.filter((c) => !c.fixed && excluded.has(c.id));
  const fixed = changes.filter((c) => c.fixed);

  const effectiveCount = effective.length;
  const isBulk = effectiveCount > threshold;
  const noun = effectiveCount === 1 ? 'task' : 'tasks';

  const toggle = (id: string) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const canConfirm = !unavailable && effectiveCount > 0 && !busy && !confirmDisabledReason;
  const disabledReason = confirmDisabledReason
    ? confirmDisabledReason
    : unavailable
      ? 'The changes for this request were not listed, so there is nothing to confirm. Nothing was changed.'
      : effectiveCount === 0
        ? 'Every listed change is excluded. Tick at least one to apply this action.'
        : null;

  return (
    <section
      aria-labelledby={headingId}
      data-testid="action-preview"
      data-bulk={isBulk ? 'true' : 'false'}
      data-effective-count={effectiveCount}
      className={`rounded-xl border border-accent/40 bg-card p-3.5 text-card-foreground ${className}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
          {/* P9: proposed (awaiting you) is always icon + label, never colour alone. */}
          <CalendarPlus size={12} className="shrink-0 text-accent" aria-hidden="true" />
          <h3
            id={headingId}
            className="font-mono text-caption font-semibold uppercase tracking-wider text-accent"
          >
            Proposed
          </h3>
          <AITag provenance="suggested" />
        </div>
        <p
          className="inline-flex shrink-0 items-center gap-1 text-caption text-accent"
          data-testid="action-preview-state"
          role="status"
          aria-live="polite"
        >
          Awaiting your approval
        </p>
      </header>

      {/* P15.1 (1) verb + object count — stated before anything is applied. */}
      <p
        className="mt-2 text-footnote font-semibold leading-snug text-foreground"
        data-testid="action-preview-count"
      >
        This would {verb} {effectiveCount} {noun}.
      </p>
      {skipped.length > 0 ? (
        <p className="mt-0.5 text-caption text-muted-foreground" data-testid="action-preview-skipped-count">
          {skipped.length} {skipped.length === 1 ? 'change is' : 'changes are'} excluded and will be
          left alone.
        </p>
      ) : null}

      {/* The >10 rule, stated in words as well as numbers. */}
      {isBulk ? (
        <p
          className="mt-2 flex items-start gap-1.5 rounded-lg border border-status-warning-fill/40 bg-status-warning-fill/10 px-2.5 py-2 text-caption font-semibold leading-relaxed text-foreground"
          data-testid="action-preview-threshold"
          role="alert"
        >
          <TriangleAlert size={12} className="mt-0.5 shrink-0 text-status-warning-text" aria-hidden="true" />
          <span className="min-w-0">
            More than {threshold} tasks — this needs your explicit confirmation. All {effectiveCount}{' '}
            are listed below before anything changes.
          </span>
        </p>
      ) : null}

      {/* P17.3 AI error: plain reason + what state things are in. */}
      {unavailable ? (
        <div className="mt-2" data-testid="action-preview-unavailable">
          <p className="text-footnote font-semibold leading-relaxed text-foreground">
            {unavailableReason}
          </p>
          <p className="mt-0.5 text-caption leading-relaxed text-muted-foreground">
            Nothing was changed.
          </p>
        </div>
      ) : null}

      {changes.length > 0 ? (
        <div className="mt-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <h4
              id={listId}
              className="font-mono text-caption font-semibold uppercase tracking-wider text-muted-foreground"
            >
              Changes
            </h4>
            <p className="text-caption text-muted-foreground">
              Tick to leave a change alone
            </p>
          </div>

          {/* P8.3: wide content scrolls in its own container, never the page. */}
          <ul
            aria-labelledby={listId}
            className="mt-1.5 max-h-72 space-y-1 overflow-y-auto pr-1"
            data-testid="action-preview-list"
          >
            {changes.map((c) => {
              const isExcluded = !c.fixed && excluded.has(c.id);
              return (
                <li key={c.id}>
                  <label
                    className={`flex min-h-11 cursor-pointer items-start gap-2 rounded-lg border px-2 py-1.5 transition-colors ${
                      isExcluded
                        ? 'border-border-subtle bg-muted opacity-70'
                        : 'border-border-subtle bg-card hover:bg-muted'
                    } ${c.fixed ? 'cursor-not-allowed' : ''}`}
                    data-testid="action-preview-item"
                    data-excluded={isExcluded ? 'true' : 'false'}
                  >
                    <input
                      type="checkbox"
                      checked={!isExcluded && !c.fixed}
                      disabled={c.fixed || unavailable}
                      onChange={() => toggle(c.id)}
                      aria-describedby={c.fixed ? `${listId}-fixed-${c.id}` : undefined}
                      data-testid="action-preview-item-toggle"
                      className="mt-0.5 size-5 shrink-0 accent-accent"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                        <span className="font-mono text-caption font-semibold uppercase tracking-wider text-accent">
                          {KIND_LABEL[c.kind]}
                        </span>
                        <span
                          className={`text-footnote font-semibold leading-snug ${
                            isExcluded ? 'text-muted-foreground line-through' : 'text-foreground'
                          }`}
                        >
                          {c.title}
                        </span>
                        {c.fixed ? (
                          <span
                            id={`${listId}-fixed-${c.id}`}
                            className="inline-flex items-center gap-1 text-caption text-muted-foreground"
                            data-testid="action-preview-item-fixed"
                          >
                            <Lock size={11} aria-hidden="true" />
                            {c.fixedLabel ?? 'Fixed — cannot be moved'}
                          </span>
                        ) : null}
                      </span>
                      {c.from || c.to ? (
                        <span className="mt-0.5 block text-caption leading-relaxed text-muted-foreground">
                          {c.from ? (
                            <span className="line-through decoration-muted-foreground">{c.from}</span>
                          ) : (
                            <span>Unscheduled</span>
                          )}
                          <span aria-hidden="true"> → </span>
                          <span className="sr-only"> becomes </span>
                          <span className="font-semibold text-foreground">{c.to ?? 'Cleared'}</span>
                        </span>
                      ) : null}
                      {c.note ? (
                        <span className="mt-0.5 block text-caption leading-relaxed text-muted-foreground">
                          {c.note}
                        </span>
                      ) : null}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>

          {fixed.length > 0 ? (
            <p
              className="mt-1.5 text-caption leading-relaxed text-muted-foreground"
              data-testid="action-preview-fixed-note"
            >
              {fixed.length} of these {fixed.length === 1 ? 'item is' : 'items are'} marked as not
              movable and will be left alone. Automation never moves them.
            </p>
          ) : null}
        </div>
      ) : null}

      {/* P15.1 (3) and (4) apply to the pending action too, not just executed ones. */}
      <div className="mt-2.5 space-y-1 border-t border-border-subtle pt-2">
        <p className="text-caption leading-relaxed text-muted-foreground" data-testid="action-preview-not-changed">
          <span className="font-semibold text-foreground">Not changed: </span>
          {notChanged.length > 0 ? notChanged.join(' · ') : 'nothing else'}
        </p>
        <p className="text-caption leading-relaxed text-muted-foreground" data-testid="action-preview-data-used">
          <span className="font-semibold text-foreground">Used: </span>
          {dataUsed.length > 0 ? dataUsed.join(' · ') : 'not recorded for this action'}
        </p>
      </div>

      {whyOpen && why ? (
        <p
          id={whyId}
          className="mt-2 rounded-lg border border-border-subtle bg-muted px-2.5 py-2 text-caption leading-relaxed text-foreground"
          data-testid="action-preview-why"
        >
          {why}
        </p>
      ) : null}

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {/* P13: the button names the consequence. Never "OK", never a bare "Confirm". */}
        <button
          type="button"
          onClick={() => onConfirm(effective)}
          disabled={!canConfirm}
          aria-busy={busy || undefined}
          data-testid="action-preview-confirm"
          className={CONTROL_PRIMARY}
        >
          {busy ? <Loader2 size={12} className="animate-spin" aria-hidden="true" /> : <Check size={12} aria-hidden="true" />}
          {verb} {effectiveCount} {noun}
        </button>

        {onEdit ? (
          <button
            type="button"
            onClick={onEdit}
            disabled={busy}
            aria-busy={busy || undefined}
            data-testid="action-preview-edit"
            className={CONTROL}
          >
            <Pencil size={12} aria-hidden="true" />
            Edit request
          </button>
        ) : null}

        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          aria-busy={busy || undefined}
          data-testid="action-preview-cancel"
          className={CONTROL}
        >
          <X size={12} aria-hidden="true" />
          Cancel
        </button>

        {why ? (
          <button
            type="button"
            onClick={() => setWhyOpen((v) => !v)}
            aria-expanded={whyOpen}
            aria-controls={whyId}
            data-testid="action-preview-why-toggle"
            className={CONTROL}
          >
            <Info size={12} aria-hidden="true" />
            Why?
            <ChevronDown
              size={12}
              className={whyOpen ? 'rotate-180 transition-transform' : 'transition-transform'}
              aria-hidden="true"
            />
          </button>
        ) : null}
      </div>

      {/* P12: disabled is never silent — the reason is always discoverable. */}
      {disabledReason ? (
        <p
          className="mt-1.5 text-caption leading-relaxed text-muted-foreground"
          data-testid="action-preview-disabled-reason"
        >
          {disabledReason}
        </p>
      ) : null}
    </section>
  );
}
