/**
 * Quick-capture natural-language parser.
 *
 * Extracted from `components/task/QuickCaptureSheet.tsx`, where it sat inline in
 * a 1500-line JSX file and was therefore untestable. This module has NO React
 * import and no side effects: `analyseCaptureDraft` is a pure function of
 * `(text, ctx)`, which is what lets the ambiguity gate be locked down in a unit
 * test instead of by typing into a real sheet.
 *
 * The contract the rest of the app relies on:
 *  - every matched token becomes a `CaptureChip` with its source span,
 *  - the first rule to claim a span wins (later overlapping matches are dropped),
 *  - a token whose meaning is genuinely uncertain is `ambiguous: true` with
 *    `value: undefined` and a set of `options` — it is NEVER guessed. That is
 *    the gate `useQuickCapture` checks before allowing a save.
 */

export type CaptureChipKind = 'date' | 'time' | 'duration' | 'tag' | 'project' | 'priority';

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

export function minutesLabel(minutes: number): string {
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
      // Only a genuinely undecidable hour is ambiguous. "at 15" has exactly one
      // reading, so it must carry a value: `useQuickCapture` strips every chip
      // span from the title unconditionally while `buildPayload` only reads chips
      // that HAVE a value, so a valueless chip silently deletes the user's typed
      // token (P11.1 "never loses typed text"). An out-of-range hour ("at 24")
      // yields no options and therefore stays valueless, which is correct — the
      // ambiguity gate then blocks the save rather than discarding the text.
      if (options.length !== 1) {
        return { label: `at ${hour}:00`, ambiguous: true, options };
      }
      return { label: `at ${hour}:00`, value: options[0].value, options };
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
    // Bare "for N" runs LAST among durations. "Read for 2 hours" names its unit
    // outright, so the hours rule above claims "2 hours" first and this rule's
    // "for 2" is then dropped as an overlap. Claiming it first would ask the user
    // "2 minutes or 2 hours?" for text that already answered the question.
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

/**
 * The ambiguity gate, as a pure function. `useQuickCapture` derives
 * `ambiguousChips` from the overlay state and uses this to decide whether a
 * save is allowed; keeping it here means the rule — "never guess, always ask" —
 * is testable without a React tree.
 *
 * A chip blocks a save only when it is still unresolved: not removed, still
 * flagged ambiguous, and carrying no chosen value.
 */
export function unresolvedChips(chips: CaptureChip[]): CaptureChip[] {
  return chips.filter((chip) => !chip.removed && chip.ambiguous && chip.value === undefined);
}