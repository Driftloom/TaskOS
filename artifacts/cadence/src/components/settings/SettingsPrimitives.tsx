import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import {
  Bell,
  Check,
  CheckCircle2,
  CircleDashed,
  CircleSlash,
  Clock,
  Globe,
  Loader2,
  Mail,
  MessageSquare,
  Pause,
  RotateCcw,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import {
  hourLabel,
  isOvernight,
  isValidHour,
  rangeLengthHours,
  rangeSegments,
} from '@/lib/settings/timeRange';

/**
 * Settings primitives — spec P11.1 (P0) / P12 / P13.
 *
 * Three reusable building blocks that the two Settings surfaces were
 * re-declaring inline (which P4 forbids: "A page may not define its own
 * button, card, chip, or sheet"):
 *
 *   1. ChannelStatus    — Telegram / Push / Email / watchdog connection state
 *   2. SettingsRow      — a labelled row for toggle / select controls, with the
 *                         quiet inline "Saved" confirmation of P13
 *   3. TimeRangeControl — working/quiet hours as a bar on a 24h track, including
 *                         ranges that cross midnight
 *
 * Plus `useAutosave`, the P13 lifecycle helper the rows are built on
 * (debounced ~600ms autosave, quiet "Saved" that fades in and stays ~2s).
 *
 * Rules honoured here:
 *   - P6.3  every state is icon + TEXT label + semantic colour. Never colour alone.
 *   - P7    `text-caption` (12px) is the type floor; no arbitrary font sizes.
 *   - P8.1  44px tap targets; `tap-target-expand` where the visual box is smaller.
 *   - P12   disabled is never silent; loading preserves width; error pairs
 *           colour with an icon AND text.
 *   - P13   autosave over "unsaved changes"; inline errors via aria-describedby;
 *           preserve input on error; time ranges validate on change, and an
 *           overnight range is VALID.
 *   - P5.3  token utilities only. No hex, no rgb(), no arbitrary values.
 *
 * The one raw value in this file is the `left`/`width` of the 24h track
 * segments, which is computed geometry — P8.2 sanctions absolute positioning
 * "driven by computed style variables" for block placement, the same pattern a
 * calendar block uses. Every colour is a token.
 */

// ---------------------------------------------------------------------------
// 1. ChannelStatus — P11.1 "Telegram / Push / Email connection state"
//    required states: connected · unverified · failed · paused
// ---------------------------------------------------------------------------

export type ChannelState = 'connected' | 'unverified' | 'failed' | 'paused' | 'unavailable';

export type ChannelKind = 'telegram' | 'push' | 'email' | 'watchdog';

const CHANNEL_NAME: Record<ChannelKind, string> = {
  telegram: 'Telegram',
  push: 'Web push',
  email: 'Email digest',
  watchdog: 'Healthchecks.io',
};

const CHANNEL_ICON: Record<ChannelKind, ReactNode> = {
  telegram: <MessageSquare size={14} aria-hidden="true" />,
  push: <Bell size={14} aria-hidden="true" />,
  email: <Mail size={14} aria-hidden="true" />,
  watchdog: <ShieldCheck size={14} aria-hidden="true" />,
};

const STATE_META: Record<ChannelState, { label: string; icon: ReactNode; pill: string }> = {
  // P9: Done -> check-circle-2. Green is success ONLY (P6.3 semantic exclusivity).
  connected: {
    label: 'Connected',
    icon: <CheckCircle2 size={12} aria-hidden="true" />,
    pill: 'border-success/30 bg-success/15 text-status-success-text',
  },
  // Not linked / not confirmed yet. Yellow = caution, never "almost done" green.
  unverified: {
    label: 'Not verified',
    icon: <CircleDashed size={12} aria-hidden="true" />,
    pill: 'border-status-warning-fill/40 bg-status-warning-fill/10 text-status-warning-text',
  },
  failed: {
    label: 'Failed',
    icon: <TriangleAlert size={12} aria-hidden="true" />,
    pill: 'border-status-danger-fill/40 bg-status-danger-fill/5 text-status-danger-text',
  },
  // P9: Paused -> pause glyph + the word "Paused".
  paused: {
    label: 'Paused',
    icon: <Pause size={12} aria-hidden="true" />,
    pill: 'border-border bg-muted text-muted-foreground',
  },
  /**
   * Extension beyond the four states P11.1 lists. Web push and the email digest
   * are specified (P11.1, locked decision D-15) but have no delivery path in
   * this build, so calling them "unverified" or "failed" would be a lie the
   * user cannot act on. "Not available" is the honest state and matches the
   * P17.2 permission/config empty state.
   */
  unavailable: {
    label: 'Not available',
    icon: <CircleSlash size={12} aria-hidden="true" />,
    pill: 'border-border bg-muted text-muted-foreground',
  },
};

export interface ChannelStatusProps {
  kind: ChannelKind;
  state: ChannelState;
  /**
   * One line saying what the state MEANS for the user. P17.2 permission/config
   * copy pattern: "what's missing and what it costs".
   */
  detail?: ReactNode;
  /**
   * The link-code / connect entry point. P11.1: "the link-code flow lives here."
   * Rendered beside the status, never inside it.
   * Do NOT pass this when ChannelStatus sits inside another button — nesting
   * interactive elements is invalid HTML; use `compact` there instead.
   */
  action?: { label: string; onClick: () => void; busy?: boolean };
  /** Extra inline control beside the primary action (e.g. "Send test message"). */
  secondaryAction?: { label: string; onClick: () => void; busy?: boolean };
  /**
   * Pill only, rendered as a <span>, for use inside another button (nav lists).
   * Detail and actions are ignored in this mode.
   */
  compact?: boolean;
  /** Announce state changes politely (P17.1). Off inside static nav lists. */
  announce?: boolean;
  className?: string;
}

export function ChannelStatus({
  kind,
  state,
  detail,
  action,
  secondaryAction,
  compact = false,
  announce = false,
  className = '',
}: ChannelStatusProps) {
  const meta = STATE_META[state];
  const channelName = CHANNEL_NAME[kind];

  if (compact) {
    return (
      <span
        data-testid={`channel-status-${kind}-${state}`}
        className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-caption font-semibold ${meta.pill} ${className}`}
      >
        {meta.icon}
        <span>{meta.label}</span>
        <span className="sr-only">{channelName}</span>
      </span>
    );
  }

  return (
    <div
      data-testid={`channel-status-${kind}-${state}`}
      className={`rounded-xl border border-border bg-card p-4 ${className}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
            {CHANNEL_ICON[kind]}
          </span>
          <div className="min-w-0">
            <h3 className="font-mono text-caption font-semibold uppercase tracking-widest text-muted-foreground">
              {channelName}
            </h3>
            {/* Icon + TEXT always (P6.3, WCAG 1.4.1). */}
            <span
              {...(announce ? { role: 'status', 'aria-live': 'polite' as const } : {})}
              className={`mt-1 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-caption font-semibold ${meta.pill}`}
            >
              {meta.icon}
              <span>{meta.label}</span>
            </span>
          </div>
        </div>

        {action || secondaryAction ? (
          <div className="flex flex-wrap items-center gap-2">
            {secondaryAction ? (
              <button
                type="button"
                onClick={secondaryAction.onClick}
                disabled={secondaryAction.busy}
                aria-busy={secondaryAction.busy || undefined}
                data-testid="channel-status-secondary-action"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border-control bg-card px-3 text-caption font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                {secondaryAction.busy ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : null}
                {secondaryAction.label}
              </button>
            ) : null}
            {action ? (
              <button
                type="button"
                onClick={action.onClick}
                disabled={action.busy}
                aria-busy={action.busy || undefined}
                data-testid="channel-status-action"
                className="btn-primary inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3.5 text-caption font-bold disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                {action.busy ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : null}
                {action.label}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {detail ? <p className="mt-2.5 text-caption leading-relaxed text-muted-foreground">{detail}</p> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. SettingsRow — labelled row for a toggle / select / custom control
// ---------------------------------------------------------------------------

export type SettingsRowState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

export interface SettingsRowProps {
  label: string;
  description?: ReactNode;
  /**
   * The control. Omit when using `control="toggle"`, which renders a Switch
   * wired to `checked` / `onCheckedChange`.
   */
  children?: ReactNode;
  control?: 'custom' | 'toggle';
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  /** Toggle only. P12: disabled is never silent — say why. */
  disabled?: boolean;
  disabledReason?: string;
  state?: SettingsRowState;
  error?: string | null;
  onRetry?: () => void;
  /** P13: the quiet confirmation wording. */
  savedLabel?: string;
  /** P13: how long the quiet confirmation stays visible. Default 2s. */
  savedDurationMs?: number;
  testId?: string;
  className?: string;
}

export function SettingsRow({
  label,
  description,
  children,
  control = 'custom',
  checked = false,
  onCheckedChange,
  disabled = false,
  disabledReason,
  state = 'idle',
  error = null,
  onRetry,
  savedLabel = 'Saved',
  savedDurationMs = 2000,
  testId = 'settings-row',
  className = '',
}: SettingsRowProps) {
  const labelId = useId();
  const statusId = `${labelId}-status`;

  // P13: "quiet inline 'Saved'" — it appears for ~2s and never blocks the row.
  const [savedVisible, setSavedVisible] = useState(false);
  useEffect(() => {
    if (state !== 'saved') {
      setSavedVisible(false);
      return;
    }
    setSavedVisible(true);
    const timer = setTimeout(() => setSavedVisible(false), savedDurationMs);
    return () => clearTimeout(timer);
  }, [state, savedDurationMs]);

  const isSaving = state === 'saving';
  const rowDisabled = disabled || isSaving;
  const showStatus = isSaving || savedVisible || Boolean(error);
  const labelClass = 'block text-footnote font-semibold text-foreground';

  return (
    <div
      data-testid={testId}
      data-state={state}
      className={`rounded-xl border border-border bg-card p-4 ${className}`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 sm:pr-4">
          {control === 'toggle' ? (
            <label htmlFor={labelId} className={labelClass}>
              {label}
            </label>
          ) : (
            // Custom controls carry their own field labels (P13: label above
            // field). A <label> with no control would be an a11y anti-pattern.
            <span className={labelClass}>{label}</span>
          )}
          {description ? (
            <p className="mt-0.5 text-caption leading-relaxed text-muted-foreground">{description}</p>
          ) : null}
          {disabled && disabledReason ? (
            <p className="mt-1 text-caption text-muted-foreground">{disabledReason}</p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-2.5 sm:justify-end">
          {control === 'toggle' ? (
            <Switch
              id={labelId}
              checked={checked}
              disabled={rowDisabled}
              onCheckedChange={onCheckedChange}
              aria-describedby={showStatus ? statusId : undefined}
              data-testid="settings-row-toggle"
              className="tap-target-expand"
            />
          ) : (
            children
          )}

          {/* Quiet confirmation / progress. Mounted only while relevant so the
              row carries no permanent empty gap. */}
          {showStatus ? (
            <span
              id={statusId}
              role="status"
              aria-live="polite"
              data-testid="settings-row-status"
              className="inline-flex min-w-0 items-center gap-1 text-caption"
            >
              {isSaving ? (
                <>
                  <Loader2 size={12} className="shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />
                  <span className="text-muted-foreground">Saving…</span>
                </>
              ) : null}
              {error && !isSaving ? (
                <>
                  <TriangleAlert size={12} className="shrink-0 text-status-danger-text" aria-hidden="true" />
                  <span className="text-status-danger-text">{error}</span>
                  {onRetry ? (
                    <button
                      type="button"
                      onClick={onRetry}
                      data-testid="settings-row-retry"
                      className="inline-flex items-center gap-1 rounded-md border border-border-control px-1.5 font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                      <RotateCcw size={11} aria-hidden="true" />
                      Retry
                    </button>
                  ) : null}
                </>
              ) : null}
              {savedVisible && !isSaving && !error ? (
                <span className="animate-enter inline-flex items-center gap-1 text-status-success-text">
                  <Check size={12} aria-hidden="true" />
                  {savedLabel}
                </span>
              ) : null}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// useAutosave — the P13 lifecycle behind the rows
// ---------------------------------------------------------------------------

export interface AutosaveOptions<T> {
  /**
   * Server-owned value. The hook adopts it whenever the server sends a new one,
   * which is what stops the UI from ever showing a value that was not persisted.
   * Callers should not render the control until this is defined.
   */
  committed: T | undefined;
  save: (value: T) => Promise<void>;
  /** P13: autosave debounced ~600ms. */
  delayMs?: number;
  /** P13: the quiet "Saved" is visible ~2s. */
  savedMs?: number;
  onSaved?: (value: T) => void;
  onError?: (message: string) => void;
}

export interface Autosave<T> {
  /** What the control should show: the draft while editing, else committed. */
  value: T;
  setValue: (next: T) => void;
  state: SettingsRowState;
  error: string | null;
  /** Flush immediately (leaving the screen, or Enter inside a field). */
  saveNow: () => void;
  retry: () => void;
}

function messageFrom(err: unknown, fallback: string): string {
  if (err && typeof err === 'object') {
    const record = err as {
      message?: unknown;
      error?: { message?: unknown };
      data?: { message?: unknown };
    };
    const candidate = record.message ?? record.error?.message ?? record.data?.message;
    if (typeof candidate === 'string' && candidate.trim()) return candidate;
  }
  return fallback;
}

export function useAutosave<T>({
  committed,
  save,
  delayMs = 600,
  savedMs = 2000,
  onSaved,
  onError,
}: AutosaveOptions<T>): Autosave<T> {
  const [draft, setDraft] = useState<T | null>(null);
  const [state, setState] = useState<SettingsRowState>('idle');
  const [error, setError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<T | null>(null);
  const lastCommittedRef = useRef(committed);

  useEffect(() => {
    if (lastCommittedRef.current === committed) return;
    lastCommittedRef.current = committed;
    setDraft(null);
    setState((prev) => (prev === 'error' || prev === 'saving' ? 'idle' : prev));
  }, [committed]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (savedRef.current) clearTimeout(savedRef.current);
    };
  }, []);

  const run = async (next: T) => {
    pendingRef.current = next;
    setState('saving');
    setError(null);
    try {
      await save(next);
      setDraft(null);
      pendingRef.current = null;
      setState('saved');
      onSaved?.(next);
      if (savedRef.current) clearTimeout(savedRef.current);
      savedRef.current = setTimeout(() => setState('idle'), savedMs);
    } catch (err) {
      // P13: preserve input on error — the draft stays, so a retry is one tap.
      const message = messageFrom(err, "Couldn't save. Your change is kept — try again.");
      setError(message);
      setState('error');
      onError?.(message);
    }
  };

  const schedule = (next: T) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      void run(next);
    }, delayMs);
  };

  const setValue = (next: T) => {
    setDraft(next);
    if (Object.is(next, committed)) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = null;
      pendingRef.current = null;
      setError(null);
      setState('idle');
      return;
    }
    setError(null);
    setState('dirty');
    schedule(next);
  };

  const saveNow = () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const next = pendingRef.current ?? draft;
    if (next === null || Object.is(next, committed)) return;
    void run(next);
  };

  const retry = () => {
    const next = pendingRef.current ?? draft;
    if (next === null) return;
    void run(next);
  };

  return {
    value: (draft === null ? committed : draft) as T,
    setValue,
    state,
    error,
    saveNow,
    retry,
  };
}

// ---------------------------------------------------------------------------
// 3. TimeRangeControl — P11.1 CRITICAL: ranges may cross midnight
// ---------------------------------------------------------------------------

export type TimeRangeTone = 'accent' | 'primary' | 'warning';

export interface TimeRangeControlProps {
  label: string;
  /** Start hour, 0-23, matching the notification_settings contract. */
  start: number;
  /** End hour, 0-23. A value below `start` means the range crosses midnight. */
  end: number;
  onChange: (next: { start: number; end: number }) => void;
  /**
   * The IANA zone the range is evaluated in. ALWAYS rendered next to the
   * control — P11.1 non-negotiable: "always shows the timezone the range is
   * evaluated in".
   */
  timezone: string;
  tone?: TimeRangeTone;
  /**
   * When true, start === end is legal and means "this window is inactive".
   * Quiet hours use it (documented product behaviour: an equal start/end
   * disables the window). Work hours do not: P13 requires start !== end.
   */
  allowEqual?: boolean;
  /** Shown when `allowEqual` and start === end. */
  equalValueNote?: string;
  state?: SettingsRowState;
  error?: string | null;
  onRetry?: () => void;
  /** Copy under the control. Use it to explain overnight ranges. */
  helperText?: ReactNode;
  startLabel?: string;
  endLabel?: string;
  disabled?: boolean;
  disabledReason?: string;
  testId?: string;
  className?: string;
}

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, hour) => hour);

const TONE_FILL: Record<TimeRangeTone, string> = {
  // Scheduled / next = blue (P6.3).
  accent: 'bg-accent/35',
  // Action / energy = orange.
  primary: 'bg-primary/35',
  // Caution = yellow.
  warning: 'bg-status-warning-fill/35',
};

export function TimeRangeControl({
  label,
  start,
  end,
  onChange,
  timezone,
  tone = 'accent',
  allowEqual = false,
  equalValueNote,
  state = 'idle',
  error = null,
  onRetry,
  helperText,
  startLabel = 'Starts',
  endLabel = 'Ends',
  disabled = false,
  disabledReason,
  testId = 'time-range-control',
  className = '',
}: TimeRangeControlProps) {
  const groupId = useId();
  const messageId = `${groupId}-message`;

  // A rejected pick stays visible so the user can see what they chose, but is
  // never handed to the parent — the server never sees an invalid range.
  const [rejected, setRejected] = useState<{ start: number; end: number; message: string } | null>(null);
  useEffect(() => {
    setRejected((prev) => (prev && prev.start === start && prev.end === end ? null : prev));
  }, [start, end]);

  const shownStart = rejected ? rejected.start : start;
  const shownEnd = rejected ? rejected.end : end;
  const overnight = isOvernight(shownStart, shownEnd);
  const lengthHours = rangeLengthHours(shownStart, shownEnd);
  const segments = rangeSegments(shownStart, shownEnd);
  const isEqual = shownStart === shownEnd;
  const inlineError = rejected?.message ?? null;

  const handleChange = (next: { start: number; end: number }) => {
    const validStart = isValidHour(next.start) ? next.start : start;
    const validEnd = isValidHour(next.end) ? next.end : end;

    if (validStart === validEnd && !allowEqual) {
      // P13: time ranges validate ON CHANGE. An overnight range (end < start) is
      // legal and explicitly NOT an error — only a zero-length range is.
      setRejected({
        start: validStart,
        end: validEnd,
        message: `${startLabel} and ${endLabel} must be different — a range can't be zero length. Pick an end hour later than the start.`,
      });
      return;
    }

    setRejected(null);
    onChange({ start: validStart, end: validEnd });
  };

  const rangeSummary = isEqual
    ? 'No window — start and end match'
    : `${hourLabel(shownStart)} – ${hourLabel(shownEnd)} · ${lengthHours}h${overnight ? ' overnight' : ''}`;

  return (
    <SettingsRow
      label={label}
      state={state}
      error={error}
      onRetry={onRetry}
      testId={`${testId}-row`}
      className={className}
    >
      <div
        data-testid={testId}
        data-overnight={overnight ? 'true' : 'false'}
        data-valid={inlineError || error ? 'false' : 'true'}
        className="w-full sm:w-80"
      >
        {/* The value in words. P6.3: the bar is never the only carrier. */}
        <p className="text-right font-mono text-caption text-foreground" data-testid={`${testId}-summary`}>
          {rangeSummary}
        </p>

        {/* 24h track. Absolute positioning with computed percentages is the
            pattern P8.2 sanctions for calendar block placement. */}
        <div
          aria-hidden="true"
          className="relative mt-2 h-2.5 w-full overflow-hidden rounded-full border border-border bg-muted"
        >
          {segments.map((segment) => (
            <span
              key={`${segment.left}-${segment.width}`}
              className={`absolute inset-y-0 ${TONE_FILL[tone]}`}
              style={{
                left: `${(segment.left / 24) * 100}%`,
                width: `${(segment.width / 24) * 100}%`,
              }}
            />
          ))}
        </div>

        <div
          aria-hidden="true"
          className="mt-1 flex justify-between font-mono text-caption text-muted-foreground"
        >
          <span>00</span>
          <span>06</span>
          <span>12</span>
          <span>18</span>
          <span>24</span>
        </div>

        <div className="mt-2 flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <label
              htmlFor={`${groupId}-start`}
              className="mb-1 block font-mono text-caption uppercase tracking-wider text-muted-foreground"
            >
              {startLabel}
            </label>
            <select
              id={`${groupId}-start`}
              value={shownStart}
              disabled={disabled}
              onChange={(event) => handleChange({ start: Number(event.target.value), end: shownEnd })}
              aria-describedby={inlineError || isEqual ? messageId : undefined}
              data-testid={`${testId}-start`}
              className="h-11 w-full rounded-lg border border-border-control bg-card px-2 font-mono text-caption text-foreground outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50"
            >
              {HOUR_OPTIONS.map((hour) => (
                <option key={hour} value={hour}>
                  {hourLabel(hour)}
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-0 flex-1">
            <label
              htmlFor={`${groupId}-end`}
              className="mb-1 block font-mono text-caption uppercase tracking-wider text-muted-foreground"
            >
              {endLabel}
            </label>
            <select
              id={`${groupId}-end`}
              value={shownEnd}
              disabled={disabled}
              onChange={(event) => handleChange({ start: shownStart, end: Number(event.target.value) })}
              aria-describedby={inlineError || isEqual ? messageId : undefined}
              data-testid={`${testId}-end`}
              className="h-11 w-full rounded-lg border border-border-control bg-card px-2 font-mono text-caption text-foreground outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50"
            >
              {HOUR_OPTIONS.map((hour) => (
                <option key={hour} value={hour}>
                  {hourLabel(hour)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* P11.1: always show the timezone the range is evaluated in. */}
        <p
          className="mt-2 flex items-center gap-1 text-caption text-muted-foreground"
          data-testid={`${testId}-timezone`}
        >
          <Globe size={11} className="shrink-0" aria-hidden="true" />
          <span>
            Hours are 0–23 in <span className="font-mono text-foreground">{timezone}</span>.
          </span>
        </p>

        {overnight ? (
          <p
            className="mt-1 flex items-center gap-1 text-caption text-muted-foreground"
            data-testid={`${testId}-overnight`}
          >
            <Clock size={11} className="shrink-0" aria-hidden="true" />
            <span>Crosses midnight — ends the next day at {hourLabel(shownEnd)}.</span>
          </p>
        ) : null}

        {isEqual && allowEqual ? (
          <p id={messageId} className="mt-1 text-caption text-muted-foreground" data-testid={`${testId}-equal-note`}>
            {equalValueNote ?? 'Start equals end, so this window is inactive.'}
          </p>
        ) : null}

        {helperText && !isEqual ? <p className="mt-1 text-caption text-muted-foreground">{helperText}</p> : null}

        {inlineError ? (
          <p
            id={messageId}
            role="alert"
            data-testid={`${testId}-error`}
            className="mt-1.5 flex items-start gap-1.5 text-caption text-status-danger-text"
          >
            <TriangleAlert size={12} className="mt-px shrink-0" aria-hidden="true" />
            <span>{inlineError}</span>
          </p>
        ) : null}

        {disabled && disabledReason ? (
          <p className="mt-1 text-caption text-muted-foreground">{disabledReason}</p>
        ) : null}
      </div>
    </SettingsRow>
  );
}
