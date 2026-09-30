import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Archive,
  ArchiveRestore,
  BarChart3,
  CheckCircle2,
  Hourglass,
  Layers,
  Loader2,
  Pencil,
  RefreshCw,
  Sparkles,
  Trash2,
  TriangleAlert,
  X,
  Zap,
} from 'lucide-react';
import { AITag } from '@/components/task/CadenceDomain';
import { plural } from '@/lib/date-utils';
import type { MemoryFact } from '@workspace/api-client-react';

/**
 * MemoryFactCard / ConfirmationPrompt — spec P11.1 (P1, with the memory module)
 * and P15.4 (Memory UX).
 *
 * P15.4 is the contract this file implements:
 *  - every fact states a human-readable statement;
 *  - a SOURCE BADGE separates the two locked decisions (D-10):
 *      Source A `behavioral`   -> "Measured from your data"  -> updates automatically
 *      Source B `conversational`-> "Inferred from chat"      -> ALWAYS prompts
 *    Indigo is reserved for agent output (P6.3), so the AI-derived half reuses
 *    `AITag` from CadenceDomain.tsx and the measured half is deliberately
 *    neutral — a badge that paints measured arithmetic as "success" green would
 *    repurpose a semantic colour (P6.3).
 *  - confidence is TEXT + METER, never colour alone (P6.3, WCAG 1.4.1);
 *  - evidence count and last-reinforced are both visible;
 *  - actions Edit / Delete / Archive are all present.
 *
 * Confidence shown is the DECAYED value, not the stored column, because that is
 * what actually drives behaviour:
 *   effective_confidence = confidence x e^(-0.02 x days_since_reinforced)
 * (spec/agent-and-memory-subsystem.md §2.3, lines 95-108). The API returns the
 * raw column, so the decay is applied here; the stored value stays visible as a
 * secondary line whenever the two differ, so the number is never a black box.
 */

// ---------------------------------------------------------------------------
// Pure helpers (exported for tests; no rendering, no side effects)
// ---------------------------------------------------------------------------

export type MemoryConfidenceBand = 'low' | 'medium' | 'high';

const CONFIDENCE_LABEL: Record<MemoryConfidenceBand, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

/**
 * P15.4 names the bands but not the cut-offs. ASSUMPTION: 50 / 80, chosen so a
 * fact has to clear "most of the evidence" to read as High. Deliberately
 * exported as one constant so it is a single edit if the numbers move.
 */
export function confidenceBand(pct: number): MemoryConfidenceBand {
  if (pct >= 80) return 'high';
  if (pct >= 50) return 'medium';
  return 'low';
}

export function confidenceBandLabel(band: MemoryConfidenceBand): string {
  return CONFIDENCE_LABEL[band];
}

/** Half-life constant from spec §2.3. 0.02 per day => ~35 days to halve. */
const DECAY_PER_DAY = 0.02;

/** Read-time decay from spec/agent-and-memory-subsystem.md §2.3. */
export function effectiveConfidence(
  stored: number,
  lastReinforcedAt: string | null | undefined,
  now: number = Date.now(),
): number {
  if (!lastReinforcedAt) return Math.max(0, Math.min(100, stored));
  const at = new Date(lastReinforcedAt).getTime();
  if (Number.isNaN(at)) return Math.max(0, Math.min(100, stored));
  const days = Math.max(0, (now - at) / 86_400_000);
  const decayed = stored * Math.exp(-DECAY_PER_DAY * days);
  return Math.max(0, Math.min(100, Math.round(decayed)));
}

/**
 * P15.4: "Facts near the pruning floor show a 'fading' state."
 *
 * ASSUMPTION: the spec says facts below a floor get archived, not deleted
 * (docs/archive/11 §2.5) but never states the number, and `memory_facts` has no
 * pruning column (lib/db/src/schema/memory.ts:21-50). 40 is the floor here; it
 * sits below the "medium" band so a fact only fades once it is genuinely weak.
 */
export const FADING_FLOOR = 40;

export function isFadingFact(fact: Pick<MemoryFact, 'confidence' | 'lastReinforcedAt'>, now?: number): boolean {
  return effectiveConfidence(fact.confidence, fact.lastReinforcedAt, now) < FADING_FLOOR;
}

const DAY_MS = 86_400_000;
const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * DAY_MS],
  ['month', 30 * DAY_MS],
  ['week', 7 * DAY_MS],
  ['day', DAY_MS],
];

/** "yesterday" / "3 days ago" / "2 months ago" — locale-aware (P19). */
export function relativeTime(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return 'never';
  const at = new Date(iso).getTime();
  if (Number.isNaN(at)) return 'never';
  const delta = at - now;
  const magnitude = Math.abs(delta);
  try {
    const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
    for (const [unit, ms] of RELATIVE_UNITS) {
      if (magnitude >= ms) return rtf.format(Math.round(delta / ms), unit);
    }
    if (magnitude >= 3_600_000) return rtf.format(Math.round(delta / 3_600_000), 'hour');
    return rtf.format(Math.round(delta / 60_000), 'minute');
  } catch {
    return new Date(at).toLocaleDateString();
  }
}

/** `sunday_sprint_rhythm` / `userNote` -> human label, no reordering of acronyms. */
function humanizeKey(key: string): string {
  const spaced = key.replace(/[_-]+/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').trim();
  if (!spaced) return key;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function stringifyValue(value: unknown): string {
  if (value === null) return '—';
  if (typeof value === 'string') return value.trim() || '—';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return '—';
  }
}

// ---------------------------------------------------------------------------
// Internal primitives (P4: pages may not invent their own chips/meters)
// ---------------------------------------------------------------------------

/**
 * Source badge — the only thing that tells Source A from Source B (D-10).
 * Conversational is AI-derived, so it reuses `AITag` rather than growing a
 * second indigo chip (P4 anti-duplication).
 */
function SourceBadge({ fact }: { fact: MemoryFact }) {
  if (fact.source === 'conversational') {
    return (
      <span className="inline-flex items-center gap-1.5" data-testid="memory-fact-source">
        <AITag provenance="suggested" />
        <span className="text-caption text-ai-text">Inferred from chat</span>
      </span>
    );
  }
  return (
    <span
      data-testid="memory-fact-source"
      className="inline-flex items-center gap-1 rounded-full border border-border-control bg-muted px-1.5 py-0.5 font-mono text-caption font-semibold uppercase tracking-wider text-foreground"
    >
      <BarChart3 size={11} aria-hidden="true" />
      Measured from your data
    </span>
  );
}

/** P15.4: confidence as text + meter. The word is the carrier; colour is not. */
function ConfidenceMeter({ value }: { value: number }) {
  const band = confidenceBand(value);
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <span className="inline-flex items-center gap-2" data-testid="memory-fact-confidence">
      <span
        role="meter"
        aria-label="Confidence"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={`${confidenceBandLabel(band)}, ${clamped} percent`}
        className="block h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-muted"
      >
        <span
          className="block h-full rounded-full bg-foreground"
          style={{ width: `${clamped}%` }}
        />
      </span>
      <span className="text-caption text-muted-foreground">
        <span className="font-semibold text-foreground">{confidenceBandLabel(band)}</span>
        <span className="font-mono"> · {clamped}%</span>
      </span>
    </span>
  );
}

function ActionButton({
  onClick,
  guard = false,
  confirmLabel,
  icon,
  tone = 'neutral',
  disabled,
  testId,
  children,
}: {
  onClick: () => void;
  /**
   * Two-step confirm for irreversible actions. P13 reserves a modal for bulk or
   * destructive flows and P3 lists "guarded destructive actions" as the
   * mechanism; the guard auto-releases after 6s so a stray tap cannot stay armed.
   */
  guard?: boolean;
  confirmLabel?: string;
  icon: ReactNode;
  tone?: 'neutral' | 'danger';
  disabled?: boolean;
  testId: string;
  children: string;
}) {
  const [armed, setArmed] = useState(false);

  // Written without a bare early return so the callback always yields a cleanup.
  useEffect(() => {
    const timer = armed ? setTimeout(() => setArmed(false), 6000) : null;
    return () => {
      if (timer !== null) clearTimeout(timer);
    };
  }, [armed]);

  const dangerArmed = tone === 'danger' && armed;
  const toneClass = dangerArmed
    ? 'border-destructive bg-destructive/10 text-destructive'
    : tone === 'danger'
      ? 'text-muted-foreground hover:bg-destructive/10 hover:text-destructive'
      : 'text-muted-foreground hover:bg-muted hover:text-foreground';

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (guard && !armed) {
            setArmed(true);
            return;
          }
          setArmed(false);
          onClick();
        }}
        disabled={disabled}
        aria-disabled={disabled || undefined}
        data-testid={testId}
        className={`inline-flex min-h-9 items-center gap-1.5 rounded-md border border-transparent px-2 text-caption font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 tap-target-expand ${toneClass}`}
      >
        {icon}
        {guard && armed ? (confirmLabel ?? 'Confirm') : children}
      </button>
      {guard && armed ? (
        <button
          type="button"
          onClick={() => setArmed(false)}
          data-testid={`${testId}-cancel`}
          aria-label={`Cancel: ${children.toLowerCase()}`}
          className="inline-flex min-h-9 items-center gap-1 rounded-md px-1.5 text-caption font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground tap-target-expand"
        >
          <X size={11} aria-hidden="true" />
          Cancel
        </button>
      ) : null}
    </>
  );
}

function InlineError({ message }: { message: string }) {
  return (
    <p
      role="alert"
      data-testid="memory-fact-error"
      className="flex items-start gap-1.5 text-caption leading-relaxed text-destructive"
    >
      <TriangleAlert size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </p>
  );
}

// ---------------------------------------------------------------------------
// MemoryFactCard
// ---------------------------------------------------------------------------

export interface MemoryFactCardProps {
  fact: MemoryFact;
  /** Statement text. Receives the next value so the card stays stateless about saving. */
  onEdit: (fact: MemoryFact, nextTitle: string) => void;
  /** Archive <-> Restore. Called with the fact; the host flips `archived`. */
  onArchive: (fact: MemoryFact) => void;
  onDelete: (fact: MemoryFact) => void;
  busy?: boolean;
  /** Rendered as an inline alert; the host owns the wording of a server failure (P17.3). */
  error?: string | null;
  /** Injected in tests so the read-time decay is deterministic. */
  now?: number;
  className?: string;
}

export function MemoryFactCard({
  fact,
  onEdit,
  onArchive,
  onDelete,
  busy = false,
  error = null,
  now,
  className = '',
}: MemoryFactCardProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(fact.title);

  // Leaving edit mode when the stored statement changes keeps the card honest
  // after a successful save without the host having to remount it.
  useEffect(() => {
    setDraft(fact.title);
    setEditing(false);
  }, [fact.title]);

  const archived = Boolean(fact.archived);
  const fading = !archived && isFadingFact(fact, now);
  const effective = effectiveConfidence(fact.confidence, fact.lastReinforcedAt, now);
  const stored = fact.confidence;
  const decayed = Math.abs(stored - effective) >= 5;
  const evidence = fact.evidenceCount ?? 0;
  const valueEntries = Object.entries(fact.value ?? {});

  const borderClass = archived
    ? 'border-border border-dashed'
    : fading
      ? 'border-status-warning-text/40'
      : 'border-border';

  return (
    <article
      data-testid={`memory-fact-card-${fact.id}`}
      data-fact-state={archived ? 'archived' : fading ? 'fading' : 'active'}
      aria-labelledby={editing ? undefined : `memory-fact-title-${fact.id}`}
      aria-label={editing ? `Edit fact: ${fact.title}` : undefined}
      className={`flex flex-col justify-between gap-3 rounded-xl border bg-card p-4 transition-colors ${borderClass} ${
        archived ? 'opacity-75' : ''
      } ${className}`}
    >
      <div className="space-y-2.5">
        {/* header: provenance + state */}
        <div className="flex flex-wrap items-center gap-1.5">
          <SourceBadge fact={fact} />
          <span className="rounded-full border border-border bg-muted px-1.5 py-0.5 font-mono text-caption text-muted-foreground">
            {humanizeKey(fact.category)}
          </span>
          {archived ? (
            <span
              data-testid="memory-fact-archived-chip"
              className="inline-flex items-center gap-1 rounded-full border border-border-control bg-muted px-1.5 py-0.5 font-mono text-caption font-semibold uppercase tracking-wider text-muted-foreground"
            >
              <Archive size={11} aria-hidden="true" />
              Archived
            </span>
          ) : null}
          {fading ? (
            <span
              data-testid="memory-fact-fading-chip"
              className="inline-flex items-center gap-1 rounded-full border border-status-warning-text/40 bg-status-warning-fill/10 px-1.5 py-0.5 font-mono text-caption font-semibold uppercase tracking-wider text-status-warning-text"
            >
              <Hourglass size={11} aria-hidden="true" />
              Fading
            </span>
          ) : null}
          {fact.rule9Multiplier != null ? (
            <span
              data-testid="memory-fact-multiplier"
              className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent/10 px-1.5 py-0.5 font-mono text-caption font-semibold uppercase tracking-wider text-accent"
            >
              <Zap size={11} aria-hidden="true" />
              {fact.rule9Multiplier}x duration
            </span>
          ) : null}
        </div>

        {/* statement */}
        {editing ? (
          <div className="space-y-2" data-testid="memory-fact-edit">
            <label
              htmlFor={`memory-fact-title-input-${fact.id}`}
              className="block text-caption font-semibold text-muted-foreground"
            >
              Edit this statement
            </label>
            <textarea
              id={`memory-fact-title-input-${fact.id}`}
              rows={2}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              data-testid="memory-fact-edit-input"
              className="w-full resize-none rounded-lg border border-border-control bg-muted p-2.5 text-body leading-snug text-card-foreground outline-none focus:border-ai"
            />
            {/* P12: a disabled control always explains itself. */}
            {!draft.trim() || draft.trim() === fact.title ? (
              <p className="text-caption text-muted-foreground">
                {!draft.trim()
                  ? 'A statement cannot be empty.'
                  : 'No change yet — edit the text to save.'}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={busy || !draft.trim() || draft.trim() === fact.title}
                aria-disabled={busy || !draft.trim() || draft.trim() === fact.title || undefined}
                onClick={() => {
                  onEdit(fact, draft.trim());
                  setEditing(false);
                }}
                data-testid="memory-fact-edit-save"
                className="btn-primary inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-footnote font-bold disabled:cursor-not-allowed disabled:opacity-50 tap-target-expand"
              >
                {busy ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : null}
                Save statement
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraft(fact.title);
                  setEditing(false);
                }}
                data-testid="memory-fact-edit-cancel"
                className="inline-flex min-h-9 items-center rounded-lg border border-border-control px-3 text-footnote font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground tap-target-expand"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <h3
            id={`memory-fact-title-${fact.id}`}
            className="text-headline font-semibold leading-snug text-card-foreground"
          >
            {fact.title}
          </h3>
        )}

        {/* the locked source split, in words */}
        <p className="flex items-start gap-1.5 text-caption leading-relaxed text-muted-foreground">
          {fact.source === 'behavioral' ? (
            <RefreshCw size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
          ) : (
            <Sparkles size={12} className="mt-0.5 shrink-0 text-ai-text" aria-hidden="true" />
          )}
          <span>
            {fact.source === 'behavioral'
              ? 'Arithmetic on your own completed work. Updates automatically as new evidence arrives.'
              : 'Inferred from chat. Cadence always asks before it changes anything on the strength of this.'}
          </span>
        </p>

        {/* confidence + evidence + reinforcement */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <ConfidenceMeter value={effective} />
          <span className="inline-flex items-center gap-1 text-caption text-muted-foreground">
            <Layers size={12} aria-hidden="true" />
            {plural(evidence, 'observation')}
          </span>
          <span className="text-caption text-muted-foreground">
            Last reinforced {relativeTime(fact.lastReinforcedAt, now)}
          </span>
        </div>

        {decayed ? (
          <p className="text-caption text-muted-foreground">
            Stored confidence {stored}%, aged to {effective}% by time since it was last reinforced.
          </p>
        ) : null}

        {fading ? (
          <p
            data-testid="memory-fact-fading-note"
            className="flex items-start gap-1.5 text-caption leading-relaxed text-status-warning-text"
          >
            <Hourglass size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>
              {fact.source === 'behavioral'
                ? 'Below the pruning floor. If no new evidence supports it, Cadence archives it — archived facts are kept, never deleted.'
                : 'Below the pruning floor. Cadence will ask you before it archives this — nothing happens on its own.'}
            </span>
          </p>
        ) : null}

        {archived ? (
          <p className="text-caption leading-relaxed text-muted-foreground">
            Archived facts stay here and are out of your active profile. Restore it to put it back in
            use.
          </p>
        ) : null}

        {/* what the fact actually stores — P27 "show what data it used" */}
        {valueEntries.length > 0 ? (
          <dl
            data-testid="memory-fact-details"
            className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border bg-muted/40 p-2.5 custom-scrollbar"
          >
            {valueEntries.map(([key, value]) => (
              <div key={key} className="flex items-start justify-between gap-3 text-caption">
                <dt className="shrink-0 text-muted-foreground">{humanizeKey(key)}</dt>
                <dd className="min-w-0 break-words text-right font-mono text-foreground">
                  {stringifyValue(value)}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}

        {error ? <InlineError message={error} /> : null}
      </div>

      {/* actions: P15.4 requires Edit / Delete / Archive */}
      <div
        aria-busy={busy || undefined}
        className="flex flex-wrap items-center gap-1 border-t border-border pt-2.5"
      >
        <button
          type="button"
          onClick={() => {
            setEditing(true);
            setDraft(fact.title);
          }}
          disabled={busy}
          aria-disabled={busy || undefined}
          data-testid={`memory-fact-edit-${fact.id}`}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-transparent px-2 text-caption font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 tap-target-expand"
        >
          <Pencil size={12} aria-hidden="true" />
          Edit
        </button>

        <ActionButton
          onClick={() => onArchive(fact)}
          icon={
            archived ? (
              <ArchiveRestore size={12} aria-hidden="true" />
            ) : (
              <Archive size={12} aria-hidden="true" />
            )
          }
          testId={`memory-fact-archive-${fact.id}`}
          disabled={busy}
        >
          {archived ? 'Restore' : 'Archive'}
        </ActionButton>

        <ActionButton
          onClick={() => onDelete(fact)}
          guard
          confirmLabel="Confirm delete"
          icon={
            busy ? (
              <Loader2 size={12} className="animate-spin" aria-hidden="true" />
            ) : (
              <Trash2 size={12} aria-hidden="true" />
            )
          }
          tone="danger"
          testId={`memory-fact-delete-${fact.id}`}
          disabled={busy}
        >
          Delete
        </ActionButton>

        <span className="ml-auto hidden text-caption text-muted-foreground sm:inline">
          {archived ? 'Not used in scheduling' : fact.source === 'behavioral' ? 'Auto-updates' : 'Confirm before use'}
        </span>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// ConfirmationPrompt — the Source B review gate (P15.4)
// ---------------------------------------------------------------------------

export interface ConfirmationPromptProps {
  fact: MemoryFact;
  /** The question as the user reads it. Source: `value.confirmationPrompt`, else the title. */
  prompt: string;
  /** What approving would change, in plain words. */
  suggestedAction: string;
  onApprove: (fact: MemoryFact) => void;
  onDismiss: (fact: MemoryFact) => void;
  busy?: boolean;
  error?: string | null;
  className?: string;
}

/**
 * Copy pattern, verbatim from P15.4 / docs/archive/11 §2.5:
 *   "I used to think you weren't a morning person, but your last three weeks say
 *    otherwise — update that?"
 * The pattern is "I used to think <old>, but <evidence> says otherwise — update
 * that?", so the host supplies the three parts and this component never invents
 * a claim about what the user believes.
 */
export function ConfirmationPrompt({
  fact,
  prompt,
  suggestedAction,
  onApprove,
  onDismiss,
  busy = false,
  error = null,
  className = '',
}: ConfirmationPromptProps) {
  return (
    <article
      data-testid={`memory-confirmation-${fact.id}`}
      aria-labelledby={`memory-confirmation-title-${fact.id}`}
      className={`flex flex-col gap-3 rounded-xl border border-ai/30 bg-card p-4 md:flex-row md:items-center md:justify-between ${className}`}
    >
      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <AITag provenance="suggested" />
          <span className="text-caption text-ai-text">Inferred from chat</span>
          <span className="rounded-full border border-border bg-muted px-1.5 py-0.5 font-mono text-caption text-muted-foreground">
            {humanizeKey(fact.category)}
          </span>
        </div>

        <p
          id={`memory-confirmation-title-${fact.id}`}
          className="text-body font-medium leading-snug text-card-foreground"
        >
          &ldquo;{prompt}&rdquo;
        </p>

        <p className="text-caption leading-relaxed text-muted-foreground">
          <span className="font-semibold text-foreground">If you approve:</span> {suggestedAction}
        </p>
        <p className="text-caption leading-relaxed text-muted-foreground">
          <span className="font-semibold text-foreground">If you dismiss:</span> nothing changes and
          Cadence keeps scheduling the way it does now.
        </p>

        {error ? <InlineError message={error} /> : null}
      </div>

      <div
        aria-busy={busy || undefined}
        className="flex shrink-0 flex-wrap items-center gap-2"
      >
        <button
          type="button"
          onClick={() => onApprove(fact)}
          disabled={busy}
          aria-disabled={busy || undefined}
          data-testid={`memory-confirmation-approve-${fact.id}`}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border-control bg-muted px-3 text-caption font-bold text-foreground transition-colors hover:bg-muted/70 disabled:cursor-not-allowed disabled:opacity-50 tap-target-expand"
        >
          {busy ? (
            <Loader2 size={13} className="animate-spin" aria-hidden="true" />
          ) : (
            <CheckCircle2 size={13} aria-hidden="true" />
          )}
          Approve
        </button>
        <button
          type="button"
          onClick={() => onDismiss(fact)}
          disabled={busy}
          aria-disabled={busy || undefined}
          data-testid={`memory-confirmation-dismiss-${fact.id}`}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-caption font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 tap-target-expand"
        >
          <X size={13} aria-hidden="true" />
          Dismiss
        </button>
      </div>
    </article>
  );
}
