import { useCallback, useId, useRef, useState } from 'react';
import type { DragEvent, KeyboardEvent, ReactNode } from 'react';
import {
  CalendarPlus,
  Check,
  GripVertical,
  Lock,
  TriangleAlert,
  X,
} from 'lucide-react';
import type { TimeBlock as TimeBlockRecord } from '@workspace/api-client-react';
import { shortTime } from '@/lib/date-utils';
import { AITag, StatusIndicator } from './CadenceDomain';

/**
 * TimeBlock — docs/13-master-design-system-prompt.md §P11.1 (P1, built here because
 * `pages/calendar/CalendarPage.tsx` was defining its own chip).
 *
 * ## Variants (§P11.1)
 * `manual` · `auto-placed` (AI tag) · `fixed` (lock) · `proposed` (dashed) · `missed`
 *
 * ## States (§P12, TimeBlock row: hover ✓ focus-visible ✓ pressed ✓ selected ✓ error ✓ readonly ✓ drag/drop ✓)
 * default · hover · focus-visible · selected · dragging · resizing · drop-target valid/invalid · overdue
 *
 * ## Non-negotiables
 *
 * 1. **"A non-drag alternative is mandatory (tap → time picker; arrow keys
 *    move/resize)."** Both paths are first-class here, not fallbacks:
 *    - tap / Enter / Space / Home → `onOpenPicker`
 *    - ArrowLeft / ArrowRight → `onMove(-15 | +15)`
 *    - ArrowUp / ArrowDown → `onResize(-15 | +15)`
 *    A drag is an *additional* affordance on top of these, never the only one.
 *    Arrow-key handling is skipped entirely for `variant="fixed"`, because
 *    `spec/auto-reschedule-engine.md` Rule 1 — "never move a fixed/immovable
 *    calendar event, under any automation mode" — outranks the interaction
 *    affordance.
 * 2. **"15-min blocks stay legible (truncate, don't clip silently)."** The title
 *    is `truncate`d (ellipsis, §P7) inside a `min-w-0` flex chain so it really
 *    does ellipsize instead of pushing the row wider; the full string stays
 *    available through the native `title` tooltip, the button's accessible name,
 *    and the visually-hidden instruction line. Under 30 minutes the range
 *    collapses to the start time alone, because "14:00–14:15" is what makes a
 *    15-minute chip unreadable.
 * 3. **Hover only inside `@media (hover: hover)`** (§P12: "touch devices never get
 *    stuck hover states"). Every hover style here is written as the arbitrary
 *    variant `[@media(hover:hover)]:hover:…` rather than the bare `hover:`
 *    shorthand, so the guarantee is explicit in the source instead of relying on
 *    a framework default.
 * 4. **Never colour alone** (§P6.3, WCAG 1.4.1): every variant ships an icon and
 *    a text label — `AITag` for auto-placed (indigo), `Lock` + "Fixed",
 *    `CalendarPlus` + "Proposed" on a dashed outline, `TriangleAlert` +
 *    "Overdue" for missed/overdue, `Check` for selected. `selected` is *also*
 *    carried by `aria-pressed` so it survives greyscale and high-contrast modes.
 *
 * ## Tap-target geometry (the reason this component has two 44px boxes and no
 * `tap-target-expand` anywhere)
 *
 * The day grid places chips in a horizontally wrapping row with `gap-2` (8px).
 * `index.css`'s `tap-target-expand` grows the hit area to 44×44 around a small
 * box — which is correct for an isolated control but wrong here: two chips whose
 * centres are <44px apart would end up with overlapping hit areas that steal
 * each other's taps (documented caveat in index.css:113-116, and the exact risk
 * the audit recorded for these six sites).
 *
 * So the component raises the **row pitch** instead and gives every control a
 * real 44px box:
 * - chip body → `min-h-11` (44px), and it is `flex-1`, so it is ≥44px wide too.
 * - remove button → `size-11` (44×44).
 * Two adjacent boxes that are each already 44px in their own axis cannot produce
 * overlapping hit areas; only pseudo-element expansion can. Both boxes sit
 * inside a 44px-tall row, so the row must be `min-h-14` — see the geometry note
 * on the hour row in `CalendarPage.tsx`.
 *
 * ## focus-visible
 * Provided globally by `index.css:73` (`outline: 2px solid hsl(var(--primary));
 * outline-offset: 2px`) — 2px + 2px offset in the accent, i.e. §P6.1
 * `focus.ring`. A second `ring-*` here would double-render, so we do not add one.
 *
 * ASSUMPTION: `variant` is caller-supplied. `GET /blocks` returns only
 * `{id, taskId, taskTitle, startAt, endAt, createdAt, updatedAt}` — there is no
 * source/lock column, so the server cannot yet tell `auto-placed` from `manual`,
 * and `CalendarPage` passes `manual` for everything it loads. The other four
 * variants are fully rendered but have no producer until that schema lands, and
 * per P0 rule 4 design work must not add one. `overdue` *is* produced, derived
 * from the clock.
 */

export type TimeBlockVariant = 'manual' | 'auto-placed' | 'fixed' | 'proposed' | 'missed';

export interface TimeBlockProps {
  block: TimeBlockRecord;
  variant?: TimeBlockVariant;
  selected?: boolean;
  dragging?: boolean;
  resizing?: boolean;
  /**
 * Whether the block reads as overdue. §P3 "Calm urgency" says red is for
 * *genuinely* overdue work and never decoration, so the component does NOT
 * default this to "the end time has passed" — that would paint every earlier
 * hour of the day red, which is alarmist and wrong. The default is `false`; the
 * owner decides, and only the `missed` variant implies it on its own.
 */
  overdue?: boolean;
  dropTarget?: 'none' | 'valid' | 'invalid';
  /** Required whenever `dropTarget` is `invalid` — a refusal must say why (§P6.3). */
  dropTargetMessage?: string;
  /**
   * The mandated non-drag alternative (§P11.1) — required, not optional: tap and
   * Enter both route here. Making it non-optional in the type is the only way to
   * stop a caller shipping a drag-only chip, which §P11.1 calls out as the one
   * thing this component must never be.
   */
  onOpenPicker: (block: TimeBlockRecord) => void;
  onRemove?: (block: TimeBlockRecord) => void;
  /** ±15 minutes, in place. Not called for `variant="fixed"` (Rule 1). */
  onMove?: (block: TimeBlockRecord, deltaMinutes: number) => void;
  /** ±15 minutes on the end time. Not called for `variant="fixed"` (Rule 1). */
  onResize?: (block: TimeBlockRecord, deltaMinutes: number) => void;
  /** Drag-and-drop is additive (§P11.1) — the keyboard/tap paths above always work without it. */
  onDropTask?: (block: TimeBlockRecord, event: DragEvent<HTMLDivElement>) => void;
  /** Lets the owning grid know which chip is under the pointer. */
  onDragOverChange?: (blockId: number, over: boolean) => void;
  className?: string;
}

const SHIFT_MINUTES = 15;

const shiftIso = (iso: string, minutes: number) =>
  new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();

const durationMinutes = (block: TimeBlockRecord) =>
  Math.round((new Date(block.endAt).getTime() - new Date(block.startAt).getTime()) / 60_000);

/** §P12: error/success/warning always pair colour with icon AND text. */
const DROP_STYLES: Record<'valid' | 'invalid', { wrap: string; icon: ReactNode; text: string }> = {
  valid: {
    wrap: 'border-success ring-1 ring-success',
    icon: <Check size={12} aria-hidden="true" />,
    text: 'Drop to place here',
  },
  invalid: {
    wrap: 'border-destructive ring-1 ring-destructive',
    icon: <TriangleAlert size={12} aria-hidden="true" />,
    text: 'Cannot drop here',
  },
};

export function TimeBlock({
  block,
  variant = 'manual',
  selected = false,
  dragging = false,
  resizing = false,
  overdue,
  dropTarget = 'none',
  dropTargetMessage,
  onOpenPicker,
  onRemove,
  onMove,
  onResize,
  onDropTask,
  onDragOverChange,
  className = '',
}: TimeBlockProps) {
  const instructionsId = useId();
  const dragDepth = useRef(0);
  const [announcement, setAnnouncement] = useState('');

  const isFixed = variant === 'fixed';
  const isMissed = variant === 'missed';
  const isOverdue = overdue ?? isMissed;

  const minutes = durationMinutes(block);
  const startLabel = shortTime(block.startAt);
  const endLabel = shortTime(block.endAt);
  // "15-min blocks stay legible": a full range is noise on a short chip.
  const rangeLabel = minutes < 30 ? startLabel : `${startLabel}–${endLabel}`;

  const accessibleName =
    `${block.taskTitle}, ${startLabel} to ${endLabel}` +
    (isFixed ? ', fixed, cannot be moved' : '') +
    (isMissed ? ', missed' : '') +
    (variant === 'auto-placed' ? ', auto-moved by automation' : '') +
    (variant === 'proposed' ? ', proposed, awaiting you' : '');

  const handleKey = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      const isArrow = event.key.startsWith('Arrow');

      // Rule 1: a fixed event never moves, by any input path — not drag, not
      // arrows. Say so rather than silently swallowing the key.
      if (isFixed && isArrow) {
        event.preventDefault();
        setAnnouncement('This block is fixed and cannot be moved or resized.');
        return;
      }

      if (event.key === 'Home' || (isArrow && event.altKey)) {
        event.preventDefault();
        onOpenPicker(block);
        return;
      }

      if (!isArrow) return;

      const move = event.key === 'ArrowLeft' ? -SHIFT_MINUTES : event.key === 'ArrowRight' ? SHIFT_MINUTES : 0;
      const resize = event.key === 'ArrowUp' ? -SHIFT_MINUTES : event.key === 'ArrowDown' ? SHIFT_MINUTES : 0;

      if (move && onMove) {
        event.preventDefault();
        setAnnouncement(
          `Moved to ${shortTime(shiftIso(block.startAt, move))} to ${shortTime(shiftIso(block.endAt, move))}.`,
        );
        onMove(block, move);
        return;
      }

      if (resize && onResize) {
        event.preventDefault();
        setAnnouncement(`Ends ${shortTime(shiftIso(block.endAt, resize))}.`);
        onResize(block, resize);
        return;
      }

      // A caller that wires the picker but not the mutations must never leave
      // an arrow key doing nothing: fall through to the picker instead.
      event.preventDefault();
      onOpenPicker(block);
    },
    [block, isFixed, onMove, onOpenPicker, onResize],
  );

  const enterDrop = () => {
    if (!onDropTask) return;
    dragDepth.current += 1;
    onDragOverChange?.(block.id, true);
  };

  const leaveDrop = () => {
    if (!onDropTask) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) onDragOverChange?.(block.id, false);
  };

  const drop = (event: DragEvent<HTMLDivElement>) => {
    if (!onDropTask) return;
    event.preventDefault();
    event.stopPropagation();
    dragDepth.current = 0;
    onDragOverChange?.(block.id, false);
    onDropTask(block, event);
  };

  const variantClasses = (() => {
    switch (variant) {
      case 'auto-placed':
        // Indigo is reserved for AI/automation-caused items (§P6.3 exclusivity).
        return 'border-ai/40 bg-ai-tint';
      case 'fixed':
        return 'border-border-strong bg-muted';
      case 'proposed':
        // §P9: proposed = calendar-plus on a dashed outline.
        return 'border-accent border-dashed bg-accent/10';
      case 'missed':
        return 'border-destructive/50 bg-destructive/10';
      default:
        return 'border-border-control bg-muted/60';
    }
  })();

  const dropStyle = dropTarget === 'none' ? null : DROP_STYLES[dropTarget];

  return (
    <div
      data-testid={`chip-block-${block.id}`}
      data-variant={variant}
      data-state={resizing ? 'resizing' : dragging ? 'dragging' : selected ? 'selected' : 'default'}
      onDragEnter={onDropTask ? enterDrop : undefined}
      onDragOver={onDropTask ? (event) => event.preventDefault() : undefined}
      onDragLeave={onDropTask ? leaveDrop : undefined}
      onDrop={onDropTask ? drop : undefined}
      className={[
        'relative flex max-w-full items-stretch overflow-hidden rounded-lg border',
        variantClasses,
        selected ? 'border-primary ring-1 ring-ring' : '',
        dragging ? 'opacity-60' : '',
        resizing ? 'border-dashed' : '',
        dropStyle ? dropStyle.wrap : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <button
        type="button"
        onClick={() => onOpenPicker(block)}
        onKeyDown={handleKey}
        aria-busy={resizing || undefined}
        aria-pressed={selected}
        aria-label={accessibleName}
        aria-describedby={instructionsId}
        aria-keyshortcuts={isFixed ? undefined : 'ArrowLeft ArrowRight ArrowUp ArrowDown Home'}
        data-testid={`button-block-${block.id}`}
        className={[
          'flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-2 px-3 text-left transition-colors',
          '@media(hover:hover)]:hover:bg-muted active:scale-98',
        ].join(' ')}
      >
        {/* Never colour alone: the selected check is a shape, not a tint. */}
        {selected ? (
          <span className="shrink-0 text-primary-text">
            <Check size={14} aria-hidden="true" />
          </span>
        ) : null}

        {dragging ? (
          <span className="shrink-0 text-muted-foreground">
            <GripVertical size={14} aria-hidden="true" />
          </span>
        ) : null}

        {/* §P11.1: the 44px floor. The root is capped with `max-w-full` so a long
            title makes the chip ellipsize (never clip) rather than widen past its
            grid row; the `min-w-0` body below is what actually does the truncating. */}
        <span className="min-w-0 flex-1 truncate font-mono text-footnote font-semibold text-foreground">
          {block.taskTitle}
        </span>

        <span className="shrink-0 font-mono text-caption tabular-nums text-muted-foreground">
          {rangeLabel}
        </span>

        {variant === 'proposed' ? (
          <span className="inline-flex shrink-0 items-center gap-1 text-caption text-accent">
            <CalendarPlus size={12} aria-hidden="true" />
            Proposed
          </span>
        ) : null}

        {isFixed ? (
          <span className="inline-flex shrink-0 items-center gap-1 text-caption text-muted-foreground">
            <Lock size={12} aria-hidden="true" />
            Fixed
          </span>
        ) : null}

        {variant === 'auto-placed' ? <AITag provenance="auto-moved" /> : null}

        {isOverdue ? <StatusIndicator status="overdue" /> : null}

        {dropStyle ? (
          <span
            data-testid={`chip-block-drop-${block.id}`}
            className={`inline-flex shrink-0 items-center gap-1 text-caption ${
              dropTarget === 'valid' ? 'text-success' : 'text-status-danger-text'
            }`}
          >
            {dropStyle.icon}
            {dropTargetMessage ?? dropStyle.text}
          </span>
        ) : null}
      </button>

      {onRemove ? (
        <button
          type="button"
          onClick={() => onRemove(block)}
          aria-label={`Remove time block for ${block.taskTitle}, ${startLabel} to ${endLabel}`}
          data-testid={`button-remove-block-${block.id}`}
          /* 44x44 for real rather than tap-target-expand: this sits flush against
             the chip body, so a pseudo-element would overlap it by 14px on each
             side and the two would fight over taps. */
          className="grid size-11 shrink-0 place-items-center border-l border-border-subtle text-muted-foreground transition-colors [@media(hover:hover)]:hover:bg-destructive/10 [@media(hover:hover)]:hover:text-destructive active:scale-98"
        >
          <X size={14} aria-hidden="true" />
        </button>
      ) : null}

      {/* Resizing is a visual + `aria-busy` state on the body above; the grips
          themselves are decorative, so the keyboard contract stays the resize path. */}
      {resizing ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-primary"
        />
      ) : null}

      {/* Keyboard contract, always available, never a tooltip-only affordance (§P11.1). */}
      <span id={instructionsId} className="sr-only">
        {isFixed
          ? 'Fixed time block. Open the time picker for details.'
          : 'Press Enter or Space to open the time picker. Left and right arrows move this block by 15 minutes. Up and down arrows change its end time by 15 minutes.'}
      </span>

      {/* Move/resize feedback. Polite, and written only in response to a key. */}
      <span className="sr-only" role="status" aria-live="polite">
        {announcement}
      </span>
    </div>
  );
}