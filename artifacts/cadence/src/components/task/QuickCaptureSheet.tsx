import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import {
  CalendarDays,
  CircleAlert,
  CircleHelp,
  Clock3,
  CloudOff,
  Flame,
  Folder,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Tag as TagIcon,
  Timer,
  X,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  createTag,
  getGetMomentumQueryKey,
  getGetTaskSummaryQueryKey,
  getListTagsQueryKey,
  getListTasksQueryKey,
  useCreateTask,
  useListProjects,
  useListTags,
  type TaskInput,
  type TaskInputPriority,
} from '@workspace/api-client-react';
import { today, timezone } from '@/lib/date-utils';
import { soundFX } from '@/lib/sound-fx';

/**
 * QuickCaptureSheet — spec P11.1 (P0) / P12 / P13 / P17.1.
 *
 * Quick capture is the product's most-used action after Start (locked decision in
 * P1). P11.1 states the non-negotiables, and this file implements all of them:
 *
 *   - Reachable in ONE TAP from every screen  -> `QuickCaptureSheet` is a
 *     controlled `open` overlay; the ＋ tab-bar slot and the `N` shortcut only
 *     have to flip `open`. (The mount point is AppShell, outside this file's
 *     scope — see the completion report.)
 *   - Keyboard opens immediately             -> `autoFocus` on the field.
 *   - NEVER loses typed text                 -> the draft is persisted, Escape no
 *     longer clears the field, and the error state keeps the text.
 *   - Enter saves                            -> the field lives in a real `<form>`.
 *   - Chips are editable and removable        -> every chip opens a resolution
 *     panel; removing one keeps the source text in the field.
 *   - The preview PREVENTS committing a misparse -> an unresolved ambiguous chip
 *     blocks submit, with the reason on screen (P3 error prevention; P12
 *     disabled-is-never-silent).
 *
 * States (P11.1): idle · typing · parsed · ambiguous · saving (optimistic) ·
 * saved · error (text retained) · offline (queued).
 *
 * P13 validation rule for capture, verbatim: do NOT validate while typing — show
 * live parse chips and check only "non-empty" on submit. "Interrupting capture
 * defeats the product."
 *
 * P1 locked decision: Today deliberately presents capture as a PERSISTENT INLINE
 * form. `variant="inline"` keeps that presentation (field + shortcut hint +
 * chips row, no button, no always-on preview line). `variant="sheet"` is the P16
 * mobile default. Both share `useQuickCapture`, so a sheet can be mounted
 * without duplicating any logic.
 *
 * ASSUMPTION (saving phase): optimistic in the user-facing sense only — the
 * "Added: …" announcement fires immediately and the typed text is retained until
 * the server confirms. No speculative row is written into the react-query cache
 * even though `listTasks` returns a flat `Task[]`, because the cache is keyed per
 * query-params object and a hand-written optimistic row could drift from the
 * generated schema. Unverified without running the app.
 */

const DRAFT_KEY = 'cadence.capture.draft.v1';
const OUTBOX_KEY = 'cadence.capture.outbox.v1';
const SAVED_LINGER_MS = 2000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CaptureChipKind = 'date' | 'time' | 'duration' | 'tag' | 'project' | 'priority';

export type CapturePhase =
  | 'idle'
  | 'typing'
  | 'parsed'
  | 'ambiguous'
  | 'saving'
  | 'saved'
  | 'error'
  | 'offline';

export interface CaptureOption {
  label: string;
  value: string;
  hint?: string;
}

export interface CaptureProjectRef {
  id: number;
  name: string;
}

export interface CaptureTagRef {
  id: number;
  name: string;
}

export interface CaptureChip {
  /** Stable across re-parses of the same text, so user edits survive typing. */
  key: string;
  kind: CaptureChipKind;
  /** The verbatim source text, so the user can recognise what was interpreted. */
  source: string;
  /** Human label, e.g. "Tomorrow", "3:00 pm", "45 min". */
  label: string;
  /** Resolved, payload-facing value. Undefined while the chip is ambiguous. */
  value: string | undefined;
  /** True when the token could mean more than one thing and the user must choose. */
  ambiguous: boolean;
  /** Candidate interpretations offered inline. Empty = "remove, or keep the text". */
  options: CaptureOption[];
  /** The user dropped this interpretation; the source text stays in the field. */
  removed: boolean;
  /** Where the chip came from in the raw text, used to strip it from the title. */
  span: { start: number; end: number };
}

export interface CaptureContext {
  projects?: CaptureProjectRef[];
  tags?: CaptureTagRef[];
}

// ---------------------------------------------------------------------------
// Parser — pure and exported so a sheet wrapper (or a test) can reuse it
// ---------------------------------------------------------------------------

const WEEKDAY_WORDS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
  'mon',
  'tues',
  'tue',
  'wed',
  'thurs',
  'thur',
  'thu',
  'fri',
  'sat',
  'sun',
];

const WEEKDAY_ALIAS: Record<string, string> = {
  mon: 'Monday',
  monday: 'Monday',
  tue: 'Tuesday',
  tues: 'Tuesday',
  tuesday: 'Tuesday',
  wed: 'Wednesday',
  wednesday: 'Wednesday',
  thu: 'Thursday',
  thur: 'Thursday',
  thurs: 'Thursday',
  thursday: 'Thursday',
  fri: 'Friday',
  friday: 'Friday',
  sat: 'Saturday',
  saturday: 'Saturday',
  sun: 'Sunday',
  sunday: 'Sunday',
};

const WEEKDAY_RE = new RegExp(`\\b(?:${WEEKDAY_WORDS.join('|')})\\b`, 'gi');
const NEXT_PERIOD_RE = new RegExp(`\\bnext\\s+(?:${WEEKDAY_WORDS.join('|')}|week|month)\\b`, 'gi');

const PRIORITY_OPTIONS: CaptureOption[] = [
  { label: 'High', value: 'high' },
  { label: 'Medium', value: 'medium' },
  { label: 'Low', value: 'low' },
];

const RELATIVE_DATE_OPTIONS: CaptureOption[] = [
  { label: 'Today', value: 'today' },
  { label: 'Tomorrow', value: 'tomorrow' },
  { label: 'Tonight', value: 'tonight' },
];

function durationOptions(minutes: number): CaptureOption[] {
  const presets = [15, 25, 45, 60, 90];
  return Array.from(new Set([...presets, minutes]))
    .sort((a, b) => a - b)
    .map((value) => ({ label: `${value} min`, value: String(value) }));
}

function minutesLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/** 24h -> the 12h form the natural-language resolver already understands. */
function to12(hour: number, minute: number, meridiem: 'am' | 'pm'): string {
  const wrapped = hour % 12 === 0 ? 12 : hour % 12;
  return `${wrapped}:${String(minute).padStart(2, '0')} ${meridiem}`;
}

interface BuiltChip {
  label: string;
  value?: string;
  ambiguous?: boolean;
  options?: CaptureOption[];
}

interface Rule {
  kind: CaptureChipKind;
  re: RegExp;
  build: (match: RegExpExecArray, ctx: CaptureContext) => BuiltChip;
}

function projectOptions(projects: CaptureProjectRef[], name: string): CaptureOption[] {
  const needle = name.toLowerCase();
  return projects
    .filter((project) => {
      const candidate = project.name.toLowerCase();
      return candidate === needle || candidate.includes(needle);
    })
    .slice(0, 6)
    .map((project) => ({ label: project.name, value: String(project.id) }));
}

/**
 * Rule order matters. Longer / more specific patterns run first and any match
 * that overlaps an already-claimed span is dropped — that is what stops
 * "1h30m" becoming a 60-minute chip plus a stray 30-minute chip, and "#urgent"
 * becoming a priority chip *and* a tag.
 */
const RULES: Rule[] = [
  {
    kind: 'priority',
    re: /(?:!high|!medium|!med|!low|#urgent|#low|\bp1\b|\bp2\b|\bp3\b)/gi,
    build: (m) => {
      const token = m[0].toLowerCase();
      const value =
        token === '!high' || token === '#urgent' || token === 'p1'
          ? 'high'
          : token === '!low' || token === '#low' || token === 'p3'
            ? 'low'
            : 'medium';
      return {
        label:
          value === 'high' ? 'High priority' : value === 'low' ? 'Low priority' : 'Medium priority',
        value,
        options: PRIORITY_OPTIONS,
      };
    },
  },
  {
    kind: 'time',
    re: /\bin\s+(\d{1,3})\s*(hours?|hrs?|h|minutes?|mins?|m)\b/gi,
    build: (m) => {
      const amount = Number(m[1]);
      const hours = /^h/.test(m[2].toLowerCase());
      return { label: m[0], value: `in ${amount} ${hours ? 'hours' : 'minutes'}` };
    },
  },
  {
    kind: 'time',
    re: /\b(\d{1,2}):(\d{2})\s*(am|pm)?\b/gi,
    build: (m) => {
      const hour = Number(m[1]);
      const minute = Number(m[2]);
      const meridiem = m[3]?.toLowerCase();
      if (meridiem === 'am' || meridiem === 'pm') {
        const text = to12(hour, minute, meridiem);
        return { label: text, value: text };
      }
      return {
        label: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
        ambiguous: true,
        options: [
          { label: to12(hour, minute, 'am'), value: to12(hour, minute, 'am'), hint: 'Morning' },
          { label: to12(hour, minute, 'pm'), value: to12(hour, minute, 'pm'), hint: 'Afternoon' },
        ],
      };
    },
  },
  {
    kind: 'time',
    re: /\b(?:at\s+)?(\d{1,2})\s*(am|pm)\b/gi,
    build: (m) => {
      const meridiem = m[2].toLowerCase() === 'am' ? 'am' : 'pm';
      return { label: `${Number(m[1])} ${meridiem}`, value: m[0].trim() };
    },
  },
  {
    kind: 'time',
    re: /\bat\s+(\d{1,2})\b/gi,
    build: (m) => {
      const hour = Number(m[1]);
      const options: CaptureOption[] = [];
      if (hour >= 1 && hour <= 12) {
        options.push({ label: to12(hour, 0, 'am'), value: to12(hour, 0, 'am'), hint: 'Morning' });
        options.push({ label: to12(hour, 0, 'pm'), value: to12(hour, 0, 'pm'), hint: 'Afternoon' });
      } else if (hour === 0) {
        options.push({ label: to12(12, 0, 'am'), value: to12(12, 0, 'am'), hint: 'Midnight' });
      } else if (hour <= 23) {
        options.push({ label: to12(hour, 0, 'pm'), value: to12(hour, 0, 'pm'), hint: 'Afternoon' });
      }
      return { label: `at ${hour}:00`, ambiguous: options.length > 1 || hour === 0, options };
    },
  },
  {
    kind: 'date',
    re: /\b(\d{4}-\d{2}-\d{2})\b/g,
    build: (m) => ({ label: m[1], value: m[1] }),
  },
  {
    kind: 'date',
    re: /\bin\s+(\d{1,3})\s*(days?|d)\b/gi,
    build: (m) => ({ label: m[0], value: m[0].trim() }),
  },
  {
    kind: 'date',
    re: NEXT_PERIOD_RE,
    build: (m) => ({ label: m[0], value: m[0].toLowerCase() }),
  },
  {
    kind: 'date',
    re: /\b(today|tomorrow|tonight)\b/gi,
    build: (m) => {
      const value = m[1].toLowerCase();
      return { label: m[1], value, options: RELATIVE_DATE_OPTIONS };
    },
  },
  {
    kind: 'date',
    re: WEEKDAY_RE,
    build: (m) => {
      const day = WEEKDAY_ALIAS[m[0].toLowerCase()] ?? m[0];
      return {
        label: day,
        ambiguous: true,
        options: [
          { label: `This ${day}`, value: `this ${day.toLowerCase()}`, hint: 'Coming up' },
          { label: `Next ${day}`, value: `next ${day.toLowerCase()}`, hint: 'The week after' },
        ],
      };
    },
  },
  {
    // Compound "1h30m" / "2 hours" must be claimed before the single-unit rules,
    // or the same text yields two duration chips.
    kind: 'duration',
    re: /\b(\d{1,2})\s*h(?:ours?|rs?)?\s*(\d{1,2})\s*m(?:in(?:ute)?s?)?\b/gi,
    build: (m) => {
      const minutes = Number(m[1]) * 60 + (m[2] ? Number(m[2]) : 0);
      return {
        label: minutesLabel(minutes),
        value: String(minutes),
        options: durationOptions(minutes),
      };
    },
  },
  {
    kind: 'duration',
    re: /\bfor\s+(\d{1,3})\b/gi,
    build: (m) => {
      const amount = Number(m[1]);
      return {
        label: `for ${amount}`,
        ambiguous: true,
        options: [
          { label: `${amount} min`, value: String(amount), hint: 'Minutes' },
          { label: `${amount} h`, value: String(amount * 60), hint: 'Hours' },
        ],
      };
    },
  },
  {
    kind: 'duration',
    re: /\b(\d{1,3})\s*(minutes?|mins?|m)\b/gi,
    build: (m) => {
      const minutes = Number(m[1]);
      return {
        label: minutesLabel(minutes),
        value: String(minutes),
        options: durationOptions(minutes),
      };
    },
  },
  {
    kind: 'duration',
    re: /\b(\d{1,3})\s*(hours?|hrs?|h)\b/gi,
    build: (m) => {
      const minutes = Number(m[1]) * 60;
      return {
        label: minutesLabel(minutes),
        value: String(minutes),
        options: durationOptions(minutes),
      };
    },
  },
  {
    kind: 'project',
    re: /\bproject:"([^"]+)"|\bproject:(\S+)/gi,
    build: (m, ctx) => {
      const name = (m[1] ?? m[2] ?? '').trim();
      const projects = ctx.projects ?? [];
      const exact = projects.find((project) => project.name.toLowerCase() === name.toLowerCase());
      if (exact) {
        return { label: name, value: String(exact.id), options: projectOptions(projects, name) };
      }
      return {
        label: name,
        ambiguous: true,
        options: [...projectOptions(projects, name), { label: 'Leave unfiled', value: '' }],
      };
    },
  },
  {
    kind: 'tag',
    re: /#([A-Za-z0-9_-]+)/g,
    build: (m, ctx) => {
      const name = m[1];
      const needle = name.toLowerCase();
      const known = (ctx.tags ?? []).filter(
        (tag) => tag.name.toLowerCase() === needle || tag.name.toLowerCase().startsWith(needle),
      );
      return {
        label: `#${name}`,
        value: name,
        options: (known.length > 0 ? known : [{ id: -1, name }])
          .slice(0, 6)
          .map((tag) => ({ label: `#${tag.name}`, value: tag.name })),
      };
    },
  },
];

/**
 * Parse raw capture text into chips plus the title left once every interpreted
 * token is removed. Pure, deterministic, exported.
 */
export function analyseCaptureDraft(
  text: string,
  ctx: CaptureContext = {},
): { chips: CaptureChip[]; title: string } {
  const claimed: { start: number; end: number }[] = [];
  const chips: CaptureChip[] = [];
  const occurrences = new Map<string, number>();

  for (const rule of RULES) {
    // A fresh RegExp per rule per call: `lastIndex` must never leak between calls.
    const re = new RegExp(
      rule.re.source,
      rule.re.flags.includes('g') ? rule.re.flags : `${rule.re.flags}g`,
    );
    let match = re.exec(text);
    while (match !== null) {
      if (match[0].length === 0) {
        re.lastIndex += 1;
        match = re.exec(text);
        continue;
      }
      const start = match.index;
      const end = start + match[0].length;
      const overlaps = claimed.some((span) => start < span.end && end > span.start);
      if (!overlaps) {
        const built = rule.build(match, ctx);
        const base = `${rule.kind}:${match[0].toLowerCase()}`;
        const seen = occurrences.get(base) ?? 0;
        occurrences.set(base, seen + 1);
        claimed.push({ start, end });
        chips.push({
          key: `${base}:${seen}`,
          kind: rule.kind,
          source: match[0],
          label: built.label,
          value: built.value,
          ambiguous: built.ambiguous ?? false,
          options: built.options ?? [],
          removed: false,
          span: { start, end },
        });
      }
      match = re.exec(text);
    }
  }

  chips.sort((a, b) => a.span.start - b.span.start);
  return { chips, title: stripChipSpans(text, chips) };
}

/** Convenience wrapper for callers that only want the chips. */
export function parseCaptureDraft(text: string, ctx: CaptureContext = {}): CaptureChip[] {
  return analyseCaptureDraft(text, ctx).chips;
}

/** Remove the given chips' source spans from the text and tidy the whitespace. */
export function stripChipSpans(text: string, chips: CaptureChip[]): string {
  const spans = chips.map((chip) => chip.span).sort((a, b) => a.start - b.start);
  let out = '';
  let cursor = 0;
  for (const span of spans) {
    if (span.start < cursor) continue;
    out += text.slice(cursor, span.start);
    cursor = span.end;
  }
  out += text.slice(cursor);
  return out.replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// Draft + outbox persistence — P13 "Quick capture keeps a local draft until
// saved", P11.1 "never loses text"
// ---------------------------------------------------------------------------

function readStorage(key: string): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function writeStorage(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    if (value) window.localStorage.setItem(key, value);
    else window.localStorage.removeItem(key);
  } catch {
    /* storage unavailable (private mode / quota) — the in-memory draft still works */
  }
}

export interface QueuedCapture {
  id: string;
  text: string;
  payload: TaskInput;
  queuedAt: number;
}

function readOutbox(): QueuedCapture[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(OUTBOX_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueuedCapture[]) : [];
  } catch {
    return [];
  }
}

function writeOutbox(items: QueuedCapture[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(OUTBOX_KEY, JSON.stringify(items));
  } catch {
    /* ignore */
  }
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

// ---------------------------------------------------------------------------
// The logic — exported so a sheet wrapper can reuse it without the markup
// ---------------------------------------------------------------------------

interface Overlays {
  /** Chosen interpretation, keyed by chip key. Clears ambiguity. */
  resolved: Record<string, string>;
  /** Free-text edit (tag rename), keyed by chip key. */
  edited: Record<string, string>;
  /** Keys the user removed. */
  removed: Record<string, true>;
}

const EMPTY_OVERLAYS: Overlays = { resolved: {}, edited: {}, removed: {} };

export interface UseQuickCaptureOptions {
  projects?: CaptureProjectRef[];
  tags?: CaptureTagRef[];
  onSaved?: (info: { title: string; queued: boolean }) => void;
  /** Set false to disable draft persistence (tests). */
  persistDraft?: boolean;
}

export interface QuickCaptureController {
  text: string;
  setText: (next: string) => void;
  clear: () => void;
  chips: CaptureChip[];
  activeChips: CaptureChip[];
  ambiguousChips: CaptureChip[];
  /** The title that will actually be saved. */
  title: string;
  phase: CapturePhase;
  /** P17.1 polite announcement for the live region. */
  announcement: string;
  error: string | null;
  /** Why submit is blocked, or null. Never hidden behind a disabled control. */
  blockReason: string | null;
  canSubmit: boolean;
  submit: () => void;
  retry: () => void;
  isSaving: boolean;
  queuedCount: number;
  online: boolean;
  resolvingKey: string | null;
  openResolver: (key: string) => void;
  closeResolver: () => void;
  resolveChip: (key: string, option: CaptureOption) => void;
  editChip: (key: string, value: string) => void;
  removeChip: (key: string) => void;
  restoreChip: (key: string) => void;
  restoredDraft: boolean;
  dismissRestoredNotice: () => void;
}

export function useQuickCapture({
  projects = [],
  tags = [],
  onSaved,
  persistDraft = true,
}: UseQuickCaptureOptions = {}): QuickCaptureController {
  const queryClient = useQueryClient();
  const create = useCreateTask();

  const [text, setTextState] = useState<string>(() => (persistDraft ? readStorage(DRAFT_KEY) : ''));
  const [overlays, setOverlays] = useState<Overlays>(EMPTY_OVERLAYS);
  const [error, setError] = useState<string | null>(null);
  const [savedTitle, setSavedTitle] = useState<string | null>(null);
  const [outbox, setOutbox] = useState<QueuedCapture[]>(readOutbox);
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine !== false,
  );
  const [resolvingKey, setResolvingKey] = useState<string | null>(null);
  const [restoredDraft, setRestoredDraft] = useState<boolean>(
    () => persistDraft && readStorage(DRAFT_KEY).trim().length > 0,
  );

  const ctx = useMemo<CaptureContext>(() => ({ projects, tags }), [projects, tags]);
  const analysed = useMemo(() => analyseCaptureDraft(text, ctx), [text, ctx]);

  const chips = useMemo<CaptureChip[]>(
    () =>
      analysed.chips.map((chip) => {
        if (overlays.removed[chip.key]) {
          return { ...chip, removed: true, ambiguous: false, value: undefined };
        }
        const edited = overlays.edited[chip.key];
        if (edited !== undefined) {
          return { ...chip, label: `#${edited}`, value: edited, ambiguous: false };
        }
        const resolved = overlays.resolved[chip.key];
        if (resolved !== undefined) {
          const match = chip.options.find((option) => option.value === resolved);
          return {
            ...chip,
            value: resolved === '' ? undefined : resolved,
            label: match?.label ?? chip.label,
            ambiguous: false,
          };
        }
        return chip;
      }),
    [analysed.chips, overlays],
  );

  // Drop overlay keys whose chips no longer exist so a long editing session does
  // not accumulate dead state. Returning `prev` keeps this from looping.
  useEffect(() => {
    setOverlays((prev) => {
      const live = new Set(chips.map((chip) => chip.key));
      const prune = (record: Record<string, unknown>) => {
        let changed = false;
        const next: Record<string, unknown> = {};
        for (const key of Object.keys(record)) {
          if (live.has(key)) next[key] = record[key];
          else changed = true;
        }
        return changed ? next : record;
      };
      const resolved = prune(prev.resolved);
      const edited = prune(prev.edited);
      const removed = prune(prev.removed);
      if (resolved === prev.resolved && edited === prev.edited && removed === prev.removed) {
        return prev;
      }
      return { resolved, edited, removed } as Overlays;
    });
  }, [chips]);

  const activeChips = useMemo(() => chips.filter((chip) => !chip.removed), [chips]);
  const ambiguousChips = useMemo(
    () => activeChips.filter((chip) => chip.ambiguous && chip.value === undefined),
    [activeChips],
  );

  /**
   * Only the chips the payload actually consumes are stripped from the title.
   * A second time or duration in the same sentence ("standup 3pm, review 5pm")
   * keeps its text, because silently deleting the user's words is exactly the
   * data loss P11.1 forbids.
   */
  const consumedKeys = useMemo(() => {
    const keys = new Set<string>();
    const take = (kind: CaptureChipKind, all: boolean) => {
      const matches = activeChips.filter((chip) => chip.kind === kind);
      (all ? matches : matches.slice(0, 1)).forEach((chip) => keys.add(chip.key));
    };
    take('date', false);
    take('time', false);
    take('priority', false);
    take('duration', false);
    // The user made an explicit choice about a project token (even "leave
    // unfiled"), so it is consumed either way.
    take('project', false);
    // Every tag is attached, so every tag is consumed.
    take('tag', true);
    return keys;
  }, [activeChips]);

  const title = useMemo(() => {
    const consumed = activeChips.filter((chip) => consumedKeys.has(chip.key));
    const stripped = stripChipSpans(text, consumed);
    // Everything the user typed was an interpretation — keep their words.
    return stripped.length > 0 ? stripped : text.trim();
  }, [text, activeChips, consumedKeys]);

  const setText = useCallback(
    (next: string) => {
      setTextState(next);
      setError(null);
      setRestoredDraft(false);
      if (persistDraft) writeStorage(DRAFT_KEY, next);
    },
    [persistDraft],
  );

  const clear = useCallback(() => {
    setTextState('');
    setOverlays(EMPTY_OVERLAYS);
    setError(null);
    setRestoredDraft(false);
    setResolvingKey(null);
    if (persistDraft) writeStorage(DRAFT_KEY, '');
  }, [persistDraft]);

  const invalidates = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListTagsQueryKey() });
    queryClient.invalidateQueries({
      queryKey: getGetTaskSummaryQueryKey({ date: today(), timezone: timezone() }),
    });
    queryClient.invalidateQueries({
      queryKey: getGetMomentumQueryKey({ date: today(), timezone: timezone() }),
    });
  }, [queryClient]);

  /**
   * ASSUMPTION: with a time but no date, the token is anchored to "today" so the
   * chip's meaning matches what is actually sent to the resolver. Before the
   * extraction the bare time match was sent; anchoring removes the ambiguity
   * rather than passing it downstream. Unverified against the server resolver.
   */
  const buildPayload = useCallback(async (): Promise<TaskInput> => {
    const dateChip = activeChips.find((chip) => chip.kind === 'date' && chip.value);
    const timeChip = activeChips.find((chip) => chip.kind === 'time' && chip.value);
    const dueParts: string[] = [];
    if (dateChip?.value) dueParts.push(dateChip.value);
    if (timeChip?.value) dueParts.push(timeChip.value);
    let dueText = dueParts.length > 0 ? dueParts.join(' ') : null;
    if (dueText && !dateChip) dueText = `today ${dueText}`;

    const priorityChip = activeChips.find((chip) => chip.kind === 'priority' && chip.value);
    const durationChip = activeChips.find((chip) => chip.kind === 'duration' && chip.value);
    const projectChip = activeChips.find((chip) => chip.kind === 'project' && chip.value);
    const tagChips = activeChips.filter((chip) => chip.kind === 'tag' && chip.value);

    let tagIds: number[] = [];
    if (tagChips.length > 0) {
      try {
        const resolved = await Promise.all(
          tagChips.map((chip) => createTag({ name: chip.value as string })),
        );
        tagIds = resolved.map((tag) => tag.id);
      } catch (err) {
        // A tag that cannot be created must not lose the task. The task still
        // saves; the tag is simply not attached.
        console.warn('Could not resolve quick capture tags:', err);
      }
    }

    const projectId = projectChip?.value ? Number(projectChip.value) : null;
    const hasProject = projectId !== null && Number.isFinite(projectId);

    return {
      title: title || text.trim(),
      status: 'open',
      priority: (priorityChip?.value as TaskInputPriority | undefined) ?? 'medium',
      durationMin: durationChip?.value ? Math.max(5, Number(durationChip.value)) : 30,
      ...(tagIds.length > 0 ? { tagIds } : {}),
      ...(hasProject ? { projectId } : {}),
      ...(dueText ? { dueText, timezone: timezone() } : { dueAt: new Date().toISOString() }),
    };
  }, [activeChips, text, title]);

  const persist = useCallback(
    async (payload: TaskInput) => {
      await create.mutateAsync({ data: payload });
      invalidates();
    },
    [create, invalidates],
  );

  const attemptedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const goOnline = () => {
      attemptedRef.current.clear();
      setOnline(true);
    };
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // Flush the offline queue as soon as the connection returns. Each queued id
  // is attempted once per connection so a persistent failure cannot spin.
  useEffect(() => {
    if (!online || outbox.length === 0) return;
    const fresh = outbox.filter((item) => !attemptedRef.current.has(item.id));
    if (fresh.length === 0) return;
    fresh.forEach((item) => attemptedRef.current.add(item.id));
    let cancelled = false;
    void (async () => {
      const done: string[] = [];
      for (const item of fresh) {
        try {
          await persist(item.payload);
          done.push(item.id);
        } catch {
          // Keep it queued; it retries the next time the connection returns.
        }
      }
      if (cancelled || done.length === 0) return;
      const remaining = outbox.filter((item) => !done.includes(item.id));
      setOutbox(remaining);
      writeOutbox(remaining);
      soundFX.playCompletion();
    })();
    return () => {
      cancelled = true;
    };
  }, [online, outbox, persist]);

  // The "saved" state lingers briefly so P17.1's quiet confirmation is visible.
  useEffect(() => {
    if (savedTitle === null) return;
    const timer = setTimeout(() => setSavedTitle(null), SAVED_LINGER_MS);
    return () => clearTimeout(timer);
  }, [savedTitle]);

  const submit = useCallback(() => {
    // P13: capture validates ONLY "non-empty" on submit. Nothing interrupts typing.
    if (!text.trim()) {
      setError('Type a task first — even two words is enough.');
      return;
    }
    if (ambiguousChips.length > 0) {
      setError(`Choose what "${ambiguousChips[0].source}" means before saving — tap the highlighted chip.`);
      setResolvingKey(ambiguousChips[0].key);
      return;
    }

    soundFX.playClick();
    setError(null);

    void (async () => {
      let payload: TaskInput;
      try {
        payload = await buildPayload();
      } catch (err) {
        setError(messageFrom(err, "Couldn't read what you typed. Your text is kept."));
        return;
      }

      if (!online) {
        // P17.1 offline: queue it, keep the text, say so plainly.
        const item: QueuedCapture = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          text,
          payload,
          queuedAt: Date.now(),
        };
        const next = [...outbox, item];
        setOutbox(next);
        writeOutbox(next);
        onSaved?.({ title: payload.title, queued: true });
        return;
      }

      try {
        // P17.1 task created: announce it, do not toast.
        setSavedTitle(payload.title);
        await persist(payload);
        soundFX.playCompletion();
        clear();
        onSaved?.({ title: payload.title, queued: false });
      } catch (err) {
        // P11.1 error state: the text is RETAINED. Never lose a capture.
        setSavedTitle(null);
        setError(messageFrom(err, "Couldn't save that task. Your text is kept — try again."));
      }
    })();
  }, [text, ambiguousChips, buildPayload, online, outbox, persist, clear, onSaved]);

  const retry = useCallback(() => {
    setError(null);
    submit();
  }, [submit]);

  const isSaving = create.isPending;
  const queuedCount = outbox.length;

  const dueSummary = useMemo(() => {
    const dateChip = activeChips.find((chip) => chip.kind === 'date' && chip.value);
    const timeChip = activeChips.find((chip) => chip.kind === 'time' && chip.value);
    if (!dateChip && !timeChip) return '';
    return [dateChip?.value, timeChip?.value].filter(Boolean).join(' ');
  }, [activeChips]);

  const phase: CapturePhase = (() => {
    if (isSaving) return 'saving';
    if (!online || queuedCount > 0) return 'offline';
    if (error) return 'error';
    if (savedTitle !== null) return 'saved';
    if (!text.trim()) return 'idle';
    if (ambiguousChips.length > 0) return 'ambiguous';
    if (activeChips.length > 0) return 'parsed';
    return 'typing';
  })();

  const announcement = (() => {
    switch (phase) {
      case 'saving':
        return `Saving ${title || text.trim()}`;
      case 'saved':
        return `Added: ${savedTitle ?? title}${dueSummary ? `, ${dueSummary}` : ''}`;
      case 'offline':
        if (queuedCount === 0) {
          return "You're offline. Your text is kept here and syncs when you reconnect.";
        }
        return queuedCount === 1
          ? "You're offline. 1 capture queued — it will sync when you reconnect."
          : `You're offline. ${queuedCount} captures queued — they will sync when you reconnect.`;
      case 'error':
        return error ?? 'Capture failed';
      case 'ambiguous':
        return `Tap a highlighted chip to choose what it means. ${ambiguousChips.length} to resolve.`;
      default:
        return '';
    }
  })();

  const blockReason = (() => {
    if (!text.trim() || ambiguousChips.length === 0) return null;
    if (ambiguousChips.length === 1) {
      return `Resolve "${ambiguousChips[0].source}" to save — tap the chip to choose.`;
    }
    return `Resolve ${ambiguousChips.length} chips to save — tap a highlighted chip to choose.`;
  })();

  return {
    text,
    setText,
    clear,
    chips,
    activeChips,
    ambiguousChips,
    title,
    phase,
    announcement,
    error,
    blockReason,
    canSubmit: text.trim().length > 0 && ambiguousChips.length === 0,
    submit,
    retry,
    isSaving,
    queuedCount,
    online,
    resolvingKey,
    openResolver: setResolvingKey,
    closeResolver: () => setResolvingKey(null),
    resolveChip: (key, option) => {
      setOverlays((prev) => ({ ...prev, resolved: { ...prev.resolved, [key]: option.value } }));
      setError(null);
      setResolvingKey((current) => (current === key ? null : current));
    },
    editChip: (key, value) => {
      setOverlays((prev) => ({ ...prev, edited: { ...prev.edited, [key]: value } }));
      setError(null);
    },
    removeChip: (key) => {
      setOverlays((prev) => ({ ...prev, removed: { ...prev.removed, [key]: true } }));
      setError(null);
      setResolvingKey((current) => (current === key ? null : current));
    },
    restoreChip: (key) => {
      setOverlays((prev) => {
        const removed = { ...prev.removed };
        delete removed[key];
        return { ...prev, removed };
      });
    },
    restoredDraft,
    dismissRestoredNotice: () => setRestoredDraft(false),
  };
}

// ---------------------------------------------------------------------------
// Chip presentation
// ---------------------------------------------------------------------------

const CHIP_ICON: Record<CaptureChipKind, ReactNode> = {
  date: <CalendarDays size={11} aria-hidden="true" />,
  time: <Clock3 size={11} aria-hidden="true" />,
  duration: <Timer size={11} aria-hidden="true" />,
  tag: <TagIcon size={11} aria-hidden="true" />,
  project: <Folder size={11} aria-hidden="true" />,
  priority: <Flame size={11} aria-hidden="true" />,
};

const CHIP_TONE: Record<CaptureChipKind, string> = {
  date: 'border-accent/30 bg-accent/10 text-accent',
  time: 'border-accent/30 bg-accent/10 text-accent',
  duration: 'border-border bg-muted text-muted-foreground',
  tag: 'border-border bg-muted text-muted-foreground',
  project: 'border-ai/30 bg-ai-tint text-ai',
  priority: 'border-primary/30 bg-primary/10 text-primary',
};

const REMOVED_TONE = 'border-border bg-muted text-muted-foreground line-through';

function ChipButton({
  chip,
  index,
  open,
  onToggle,
  onRemove,
  onRestore,
}: {
  chip: CaptureChip;
  index: number;
  open: boolean;
  onToggle: () => void;
  onRemove: () => void;
  onRestore: () => void;
}) {
  const tone = chip.removed ? REMOVED_TONE : CHIP_TONE[chip.kind];
  const needsChoice = !chip.removed && chip.ambiguous && chip.value === undefined;

  return (
    <span className="inline-flex items-center" data-testid={`capture-chip-${chip.kind}-${index}`}>
      {chip.removed ? (
        <button
          type="button"
          onClick={onRestore}
          aria-label={`Use "${chip.source}" again`}
          data-testid="capture-chip-restore"
          className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-caption font-semibold ${tone} transition-opacity hover:opacity-80`}
        >
          {CHIP_ICON[chip.kind]}
          <span>{chip.label}</span>
          <RotateCcw size={10} aria-hidden="true" />
          <span className="sr-only">Ignored — tap to use again</span>
        </button>
      ) : (
        <>
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            data-testid="capture-chip-open"
            className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-caption font-semibold ${tone} transition-opacity hover:opacity-80`}
          >
            {CHIP_ICON[chip.kind]}
            <span>{chip.label}</span>
            {needsChoice ? (
              <CircleHelp size={10} aria-hidden="true" />
            ) : (
              <Pencil size={9} aria-hidden="true" />
            )}
            <span className="sr-only">
              {needsChoice ? ' — tap to choose what this means' : ' — tap to edit'}
            </span>
          </button>
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Ignore "${chip.source}" and keep it as text`}
            data-testid="capture-chip-remove"
            className="ml-0.5 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X size={10} aria-hidden="true" />
          </button>
        </>
      )}
    </span>
  );
}

function ChipResolver({
  chip,
  onChoose,
  onEdit,
  onRemove,
  onClose,
}: {
  chip: CaptureChip;
  onChoose: (option: CaptureOption) => void;
  onEdit: (value: string) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(chip.value ?? '');
  const inputId = `capture-chip-edit-${chip.key.replace(/[^A-Za-z0-9]+/g, '-')}`;
  const needsChoice = chip.ambiguous && chip.value === undefined;

  return (
    <div
      role="group"
      aria-label={`Resolve the ${chip.kind} chip`}
      data-testid="capture-chip-resolver"
      className="mt-1.5 rounded-lg border border-border bg-card p-2.5"
    >
      <p className="text-caption text-muted-foreground">
        <span className="font-semibold text-foreground">{chip.source}</span>{' '}
        {needsChoice
          ? '— this could mean more than one thing. Pick the one you meant:'
          : '— change it if the reading is wrong:'}
      </p>

      {chip.options.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {chip.options.map((option) => (
            <button
              key={option.value || 'none'}
              type="button"
              onClick={() => onChoose(option)}
              data-testid="capture-chip-option"
              className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border-control bg-card px-2 text-caption font-semibold text-foreground transition-colors hover:bg-muted"
            >
              <span>{option.label}</span>
              {option.hint ? <span className="text-muted-foreground">{option.hint}</span> : null}
            </button>
          ))}
        </div>
      ) : null}

      {chip.kind === 'tag' ? (
        <div className="mt-2 flex items-center gap-2">
          <label htmlFor={inputId} className="text-caption text-muted-foreground">
            Tag name
          </label>
          <input
            id={inputId}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                onEdit(draft.trim());
              }
            }}
            data-testid="capture-chip-tag-input"
            className="h-9 min-w-0 flex-1 rounded-md border border-border-control bg-card px-2 text-caption text-foreground outline-none"
          />
          <button
            type="button"
            onClick={() => onEdit(draft.trim())}
            data-testid="capture-chip-tag-apply"
            className="inline-flex min-h-9 items-center rounded-md border border-border-control px-2 text-caption font-semibold text-foreground transition-colors hover:bg-muted"
          >
            Apply
          </button>
        </div>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onRemove}
          data-testid="capture-chip-keep-as-text"
          className="inline-flex min-h-9 items-center gap-1 rounded-md border border-border-control px-2 text-caption font-semibold text-muted-foreground transition-colors hover:bg-muted"
        >
          <X size={11} aria-hidden="true" />
          <span>Keep "{chip.source}" as plain text</span>
        </button>
        <button
          type="button"
          onClick={onClose}
          data-testid="capture-chip-resolver-close"
          className="inline-flex min-h-9 items-center rounded-md px-2 text-caption font-semibold text-muted-foreground transition-colors hover:bg-muted"
        >
          Close
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// QuickCaptureForm — the presentation. `inline` preserves Today's layout;
// `sheet` is the P16 mobile default.
// ---------------------------------------------------------------------------

export interface QuickCaptureFormProps {
  variant?: 'inline' | 'sheet';
  /** P11.1: the keyboard must open immediately. */
  autoFocus?: boolean;
  showShortcutHint?: boolean;
  className?: string;
  testId?: string;
  inputTestId?: string;
  onSaved?: (info: { title: string; queued: boolean }) => void;
}

export function QuickCaptureForm({
  variant = 'inline',
  autoFocus = false,
  showShortcutHint = false,
  className = '',
  testId = 'form-quick-capture',
  inputTestId = 'input-quick-capture',
  onSaved,
}: QuickCaptureFormProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  // Projects and tags feed the chip options. React Query de-duplicates by key,
  // so a sheet and the inline form never double-fetch.
  const { data: projectData } = useListProjects();
  const { data: tagData } = useListTags();
  const projects = useMemo(() => projectData ?? [], [projectData]);
  const tags = useMemo(() => tagData ?? [], [tagData]);

  const controller = useQuickCapture({ projects, tags, onSaved });

  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.userAgent);
  const shortcut = isMac ? '⌘⏎' : 'Ctrl ⏎';
  const isInline = variant === 'inline';

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    controller.submit();
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape' && controller.text) {
      // P11.1 "never loses text": Escape used to CLEAR the field here. It now
      // only steps away from the field, so a stray Escape can never destroy a
      // capture. The sheet closes itself and keeps the draft.
      event.preventDefault();
      inputRef.current?.blur();
    }
  };

  const resolvingChip = controller.resolvingKey
    ? controller.chips.find((chip) => chip.key === controller.resolvingKey)
    : undefined;
  const showResolver = Boolean(resolvingChip && !resolvingChip.removed);

  return (
    <form
      onSubmit={handleSubmit}
      data-testid={testId}
      data-phase={controller.phase}
      className={
        isInline
          ? `rounded-xl border border-border bg-muted p-1.5 transition-all focus-within:border-border-strong focus-within:shadow-e2 ${className}`
          : `space-y-2 ${className}`
      }
    >
      <div className="flex items-center gap-2 px-2">
        <Plus size={15} className="shrink-0 text-muted-foreground" aria-hidden="true" />
        <label htmlFor={inputTestId} className="sr-only">
          Capture a task
        </label>
        <input
          id={inputTestId}
          ref={inputRef}
          value={controller.text}
          onChange={(event) => controller.setText(event.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus={autoFocus}
          enterKeyHint="done"
          // P7: user content may be Tamil/Telugu/Hindi — let the browser choose
          // the paragraph direction instead of forcing LTR.
          dir="auto"
          maxLength={240}
          placeholder="Review PR tomorrow 3pm 45m #eng project:Hermes"
          data-testid={inputTestId}
          className="h-11 min-w-0 flex-1 bg-transparent text-subhead font-medium text-foreground placeholder:text-muted-foreground outline-none sm:h-8"
        />
        {showShortcutHint ? (
          <kbd className="hidden shrink-0 items-center rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-caption text-muted-foreground sm:inline-flex">
            {shortcut}
          </kbd>
        ) : null}
      </div>

      {/* P17.1: polite live region. Announced once, never per keystroke. */}
      <span role="status" aria-live="polite" className="sr-only">
        {controller.announcement}
      </span>

      {/* Draft restored — P13 "keeps a local draft until saved". */}
      {controller.restoredDraft ? (
        <div className="mx-2 mt-1.5 flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5 text-caption text-muted-foreground">
          <span>Unsent draft restored.</span>
          <button
            type="button"
            onClick={() => {
              controller.clear();
              inputRef.current?.focus();
            }}
            data-testid="capture-draft-discard"
            className="inline-flex min-h-9 items-center rounded-md border border-border-control px-1.5 font-semibold text-foreground transition-colors hover:bg-muted"
          >
            Discard
          </button>
        </div>
      ) : null}

      {/* Offline queue — P17.1 "Offline — n changes queued". */}
      {controller.phase === 'offline' ? (
        <p
          data-testid="capture-offline"
          className="mx-2 mt-1.5 flex items-center gap-1.5 rounded-md border border-status-warning-fill/40 bg-status-warning-fill/10 px-2 py-1.5 text-caption text-status-warning-text"
        >
          <CloudOff size={12} className="shrink-0" aria-hidden="true" />
          <span>
            {controller.queuedCount === 0
              ? "You're offline. Your text is kept here and syncs when you reconnect."
              : `Offline — ${controller.queuedCount} capture${controller.queuedCount === 1 ? '' : 's'} queued. Your text is kept and syncs automatically.`}
          </span>
        </p>
      ) : null}

      {/* Error — the typed text is retained (P11.1). */}
      {controller.error ? (
        <div
          role="alert"
          data-testid="capture-error"
          className="mx-2 mt-1.5 flex items-start gap-1.5 rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-caption text-destructive"
        >
          <CircleAlert size={12} className="mt-px shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">{controller.error}</span>
          <button
            type="button"
            onClick={controller.retry}
            data-testid="capture-retry"
            className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-md border border-border-control px-1.5 font-semibold text-foreground transition-colors hover:bg-muted"
          >
            <RotateCcw size={11} aria-hidden="true" />
            Retry
          </button>
        </div>
      ) : null}

      {/* Live parse chips — P13 "show live parse chips", P3 error prevention. */}
      {controller.chips.length > 0 ? (
        <div
          className="mt-1.5 flex flex-wrap items-center gap-1.5 border-t border-border px-2 pt-1.5"
          data-testid="capture-chips"
        >
          <span className="font-mono text-caption font-semibold uppercase tracking-wider text-muted-foreground">
            Detected
          </span>
          {controller.chips.map((chip, index) => (
            <ChipButton
              key={chip.key}
              chip={chip}
              index={index}
              open={controller.resolvingKey === chip.key}
              onToggle={() =>
                controller.resolvingKey === chip.key
                  ? controller.closeResolver()
                  : controller.openResolver(chip.key)
              }
              onRemove={() => controller.removeChip(chip.key)}
              onRestore={() => controller.restoreChip(chip.key)}
            />
          ))}
        </div>
      ) : null}

      {controller.blockReason && !controller.error ? (
        <p
          data-testid="capture-block-reason"
          className="mx-2 mt-1.5 text-caption text-status-warning-text"
        >
          {controller.blockReason}
        </p>
      ) : null}

      {showResolver && resolvingChip ? (
        <div className="px-1.5">
          <ChipResolver
            chip={resolvingChip}
            onChoose={(option) => controller.resolveChip(resolvingChip.key, option)}
            onEdit={(value) => controller.editChip(resolvingChip.key, value)}
            onRemove={() => controller.removeChip(resolvingChip.key)}
            onClose={controller.closeResolver}
          />
        </div>
      ) : null}

      {/* The inline form on Today has always been Enter-to-save with no visible
          button, so it keeps that. The sheet is a new surface and gets an
          explicit primary action plus the misparse-prevention preview line. */}
      {!isInline ? (
        <div className="flex items-center gap-2 px-2 pb-0.5 pt-1.5">
          <button
            type="submit"
            disabled={!controller.canSubmit}
            aria-busy={controller.isSaving || undefined}
            data-testid="capture-submit"
            className="btn-primary inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3.5 text-caption font-bold disabled:cursor-not-allowed disabled:opacity-50"
          >
            {controller.isSaving ? (
              <Loader2 size={13} className="animate-spin" aria-hidden="true" />
            ) : (
              <Plus size={13} strokeWidth={2.5} aria-hidden="true" />
            )}
            {controller.isSaving ? 'Saving…' : 'Capture'}
          </button>
          <p
            className="min-w-0 flex-1 truncate text-caption text-muted-foreground"
            data-testid="capture-title-preview"
          >
            {controller.text.trim() ? `Saves as “${controller.title}”` : ''}
          </p>
        </div>
      ) : null}
    </form>
  );
}

// ---------------------------------------------------------------------------
// QuickCaptureSheet — the P11.1 / P16 overlay wrapper
// ---------------------------------------------------------------------------

export interface QuickCaptureSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (info: { title: string; queued: boolean }) => void;
}

/**
 * The sheet. Today deliberately keeps capture inline (P1 locked decision), so
 * this wrapper is exported ready to mount behind the ＋ tab-bar slot: it only
 * supplies the glass chrome, the autofocus, and the dismiss affordances — all
 * the logic already lives in `useQuickCapture`.
 */
export function QuickCaptureSheet({ open, onOpenChange, onSaved }: QuickCaptureSheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Quick capture"
      onClick={() => onOpenChange(false)}
      className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 backdrop-blur-sm sm:items-center sm:p-4"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="glass-chrome w-full max-w-lg rounded-t-2xl p-4 pb-safe shadow-e3 sm:rounded-2xl sm:p-5"
      >
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-mono text-caption font-semibold uppercase tracking-widest text-muted-foreground">
            Capture
          </h2>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Close quick capture"
            data-testid="capture-sheet-close"
            className="inline-flex min-h-11 items-center justify-center rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <QuickCaptureForm
          variant="sheet"
          autoFocus
          testId="form-quick-capture-sheet"
          inputTestId="input-quick-capture-sheet"
          onSaved={(info) => {
            onSaved?.(info);
            if (!info.queued) onOpenChange(false);
          }}
        />
      </div>
    </div>
  );
}
