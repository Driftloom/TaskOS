import { describe, expect, it } from 'vitest';
import {
  analyseCaptureDraft,
  parseCaptureDraft,
  stripChipSpans,
  unresolvedChips,
  type CaptureChip,
  type CaptureContext,
} from './parseQuickCapture';

const CTX: CaptureContext = {
  projects: [
    { id: 7, name: 'Hermes' },
    { id: 9, name: 'Hermes Mobile' },
    { id: 3, name: 'Inbox Zero' },
  ],
  tags: [
    { id: 11, name: 'eng' },
    { id: 12, name: 'engagement' },
    { id: 13, name: 'home' },
  ],
};

const only = (chips: CaptureChip[], kind: string) => chips.filter((c) => c.kind === kind);

describe('analyseCaptureDraft — the placeholder string shipped in the UI', () => {
  // artifacts/cadence/src/components/task/QuickCaptureSheet.tsx uses exactly this
  // as the input placeholder, so it is the de-facto reference parse.
  it('reads "Review PR tomorrow 3pm 45m #eng project:Hermes" into one chip per token', () => {
    const { chips, title } = analyseCaptureDraft('Review PR tomorrow 3pm 45m #eng project:Hermes', CTX);

    expect(chips.map((c) => [c.kind, c.source])).toEqual([
      ['date', 'tomorrow'],
      ['time', '3pm'],
      ['duration', '45m'],
      ['tag', '#eng'],
      ['project', 'project:Hermes'],
    ]);
    expect(title).toBe('Review PR');
  });

  it('is pure: the same input twice yields the same output, and nothing mutates', () => {
    const a = analyseCaptureDraft('standup friday 25m', CTX);
    const b = analyseCaptureDraft('standup friday 25m', CTX);
    expect(a).toEqual(b);
    // Chip keys must be stable so a user's edits survive the next keystroke.
    expect(a.chips.map((c) => c.key)).toEqual(b.chips.map((c) => c.key));
  });

  it('produces no chips for plain text and returns the text as the title', () => {
    const { chips, title } = analyseCaptureDraft('Water the plants', CTX);
    expect(chips).toEqual([]);
    expect(title).toBe('Water the plants');
  });

  it('returns chips and title from one pass; parseCaptureDraft is the chips-only wrapper', () => {
    const text = 'Draft memo tomorrow';
    expect(parseCaptureDraft(text, CTX)).toEqual(analyseCaptureDraft(text, CTX).chips);
  });
});

describe('natural dates', () => {
  it('resolves today / tomorrow / tonight without asking', () => {
    for (const word of ['today', 'tomorrow', 'tonight']) {
      const chips = only(parseCaptureDraft(`Pay rent ${word}`, CTX), 'date');
      expect(chips).toHaveLength(1);
      expect(chips[0]).toMatchObject({ source: word, value: word, ambiguous: false });
    }
  });

  it('accepts an ISO date verbatim', () => {
    const chips = only(parseCaptureDraft('Ship 2026-10-05 notes', CTX), 'date');
    expect(chips).toHaveLength(1);
    expect(chips[0]).toMatchObject({ source: '2026-10-05', value: '2026-10-05' });
  });

  it('resolves "in 3 days" as a date, not as a duration', () => {
    const chips = parseCaptureDraft('Follow up in 3 days', CTX);
    expect(only(chips, 'date').map((c) => c.value)).toEqual(['in 3 days']);
    expect(only(chips, 'duration')).toHaveLength(0);
    expect(analyseCaptureDraft('Follow up in 3 days', CTX).title).toBe('Follow up');
  });

  it('resolves "in 2 hours" as a time, not as a date', () => {
    const chips = parseCaptureDraft('Ping me in 2 hours', CTX);
    expect(only(chips, 'time').map((c) => c.value)).toEqual(['in 2 hours']);
    expect(only(chips, 'date')).toHaveLength(0);
  });

  it('treats a bare weekday as AMBIGUOUS (this Friday vs next Friday)', () => {
    const [chip] = only(parseCaptureDraft('Standup friday', CTX), 'date');
    expect(chip.ambiguous).toBe(true);
    expect(chip.value).toBeUndefined();
    expect(chip.options.map((o) => o.value)).toEqual(['this friday', 'next friday']);
  });

  it('resolves "next friday" outright — the weekday rule must not double-claim it', () => {
    const chips = only(parseCaptureDraft('Standup next friday', CTX), 'date');
    expect(chips).toHaveLength(1);
    expect(chips[0]).toMatchObject({ source: 'next friday', value: 'next friday', ambiguous: false });
  });

  it('expands every weekday abbreviation to its full name in the label', () => {
    for (const [abbr, full] of [
      ['mon', 'Monday'],
      ['tues', 'Tuesday'],
      ['wed', 'Wednesday'],
      ['thurs', 'Thursday'],
      ['fri', 'Friday'],
      ['sat', 'Saturday'],
      ['sun', 'Sunday'],
    ] as const) {
      const [chip] = only(parseCaptureDraft(`Do it ${abbr}`, CTX), 'date');
      expect(chip.label).toBe(full);
      expect(chip.ambiguous).toBe(true);
    }
  });
});

describe('natural times', () => {
  it('accepts an explicit meridiem with no ambiguity', () => {
    const [chip] = only(parseCaptureDraft('Call at 3:30 pm', CTX), 'time');
    expect(chip).toMatchObject({ source: '3:30 pm', value: '3:30 pm', ambiguous: false });
  });

  it('marks a meridiem-less clock time AMBIGUOUS rather than guessing 12h vs 24h', () => {
    const [chip] = only(parseCaptureDraft('Call at 3:30', CTX), 'time');
    expect(chip.ambiguous).toBe(true);
    expect(chip.value).toBeUndefined();
    expect(chip.options.map((o) => o.label)).toEqual(['3:30 am', '3:30 pm']);
  });

  it('accepts a bare "3pm" / "11am"', () => {
    expect(only(parseCaptureDraft('Standup 3pm', CTX), 'time')[0]).toMatchObject({
      value: '3pm',
      ambiguous: false,
    });
    expect(only(parseCaptureDraft('Gym 11am', CTX), 'time')[0]).toMatchObject({
      value: '11am',
      ambiguous: false,
    });
  });

  it('marks a bare "at 5" AMBIGUOUS between 5am and 5pm', () => {
    const [chip] = only(parseCaptureDraft('Meet at 5', CTX), 'time');
    expect(chip.ambiguous).toBe(true);
    expect(chip.value).toBeUndefined();
    expect(chip.options.map((o) => o.value)).toEqual(['5:00 am', '5:00 pm']);
  });

  it('normalises midnight so "at 0" is unambiguous 12:00 am', () => {
    const [chip] = only(parseCaptureDraft('Deploy at 0', CTX), 'time');
    expect(chip.options.map((o) => o.value)).toEqual(['12:00 am']);
  });

  /**
   * Regression: `at 13`…`at 23` produce exactly ONE candidate ("3:00 pm"), so the
   * rule marked the chip `ambiguous: false` but never assigned a `value`.
   * `useQuickCapture` strips every chip span from the title unconditionally while
   * `buildPayload` only reads chips that HAVE a value, so the token was deleted
   * from the task title and never sent — P11.1 "never loses typed text". An
   * undecidable hour now carries its single option's value.
   */
  it('"at 15" is unambiguous AND carries the value, so the token is not dropped', () => {
    const [chip] = only(parseCaptureDraft('Meet at 15', CTX), 'time');
    expect(chip.ambiguous).toBe(false);
    expect(chip.value).toBe('3:00 pm');
    expect(chip.options.map((o) => o.value)).toEqual(['3:00 pm']);
    expect(unresolvedChips([chip])).toEqual([]);
  });

  it('"at 0" is midnight and carries the 12:00 am value', () => {
    const [chip] = only(parseCaptureDraft('Deploy at 0', CTX), 'time');
    expect(chip.ambiguous).toBe(false);
    expect(chip.value).toBe('12:00 am');
  });

  it('an out-of-range hour stays valueless so the gate blocks the save', () => {
    // "at 24" has no candidate at all. It must NOT silently become a valueless,
    // non-ambiguous chip — that is the data-loss path. Staying ambiguous with no
    // value is what makes `unresolvedChips` block submission.
    const [chip] = only(parseCaptureDraft('Meet at 24', CTX), 'time');
    expect(chip.ambiguous).toBe(true);
    expect(chip.value).toBeUndefined();
    expect(unresolvedChips([chip])).toHaveLength(1);
  });
});

describe('durations', () => {
  it('reads a compound "1h30m" as ONE 90-minute chip, not two chips', () => {
    const chips = only(parseCaptureDraft('Deep work 1h30m', CTX), 'duration');
    expect(chips).toHaveLength(1);
    expect(chips[0]).toMatchObject({ value: '90', ambiguous: false });
    expect(chips[0].label).toBe('1h 30m');
    expect(analyseCaptureDraft('Deep work 1h30m', CTX).title).toBe('Deep work');
  });

  it('converts a bare hour figure to minutes', () => {
    const [chip] = only(parseCaptureDraft('Read 2 hours', CTX), 'duration');
    expect(chip).toMatchObject({ source: '2 hours', value: '120', ambiguous: false });
    expect(chip.label).toBe('2h');
    expect(analyseCaptureDraft('Read 2 hours', CTX).title).toBe('Read');
  });

  it('keeps a minute figure as minutes', () => {
    const [chip] = only(parseCaptureDraft('Tidy 45m', CTX), 'duration');
    expect(chip.value).toBe('45');
    expect(chip.label).toBe('45 min');
  });

  it('renders a mixed hour+minute label without a trailing zero ("1h 30m", not "1h 30m 0")', () => {
    const [chip] = only(parseCaptureDraft('Write 1h 5m', CTX), 'duration');
    expect(chip.label).toBe('1h 5m');
    expect(chip.value).toBe('65');
  });

  it('marks a bare "for 2" AMBIGUOUS between minutes and hours', () => {
    const [chip] = only(parseCaptureDraft('Gym for 2', CTX), 'duration');
    expect(chip.ambiguous).toBe(true);
    expect(chip.value).toBeUndefined();
    expect(chip.options.map((o) => o.value)).toEqual(['2', '120']);
  });

  /**
   * Regression: bare "for N" used to run before the hour/minute rules, so in
   * "Read for 2 hours" it claimed the span "for 2" first and the unambiguous
   * "2 hours" match was dropped as an overlap — asking "2 minutes or 2 hours?"
   * for text that named the unit outright. "for N" now runs last among durations.
   */
  it('"for 2 hours" claims the explicit unit, not the bare "for N" span', () => {
    const chips = only(parseCaptureDraft('Read for 2 hours', CTX), 'duration');
    expect(chips).toHaveLength(1);
    expect(chips[0]).toMatchObject({ source: '2 hours', ambiguous: false, value: '120' });
    expect(unresolvedChips(chips)).toEqual([]);
  });

  it('a genuinely unitless "for 2" is still ambiguous between minutes and hours', () => {
    const chips = only(parseCaptureDraft('Gym for 2', CTX), 'duration');
    expect(chips).toHaveLength(1);
    expect(chips[0]).toMatchObject({ source: 'for 2', ambiguous: true, value: undefined });
    expect(chips[0].options.map((o) => o.value)).toEqual(['2', '120']);
  });

  it('always offers the duration presets alongside the parsed value', () => {
    const [chip] = only(parseCaptureDraft('Tidy 45m', CTX), 'duration');
    const values = chip.options.map((o) => o.value);
    expect(values).toContain('45');
    for (const preset of ['15', '25', '45', '60', '90']) {
      expect(values).toContain(preset);
    }
  });
});

describe('project and tag chips', () => {
  it('resolves a known project to its id with no ambiguity', () => {
    const [chip] = only(parseCaptureDraft('Plan project:Hermes', CTX), 'project');
    expect(chip).toMatchObject({ value: '7', ambiguous: false });
  });

  it('marks an UNKNOWN project AMBIGUOUS and always offers "Leave unfiled"', () => {
    const [chip] = only(parseCaptureDraft('Plan project:Zeus', CTX), 'project');
    expect(chip.ambiguous).toBe(true);
    expect(chip.value).toBeUndefined();
    expect(chip.options.at(-1)).toEqual({ label: 'Leave unfiled', value: '' });
  });

  it('accepts a quoted project name containing spaces', () => {
    const [chip] = only(parseCaptureDraft('Plan project:"Inbox Zero"', CTX), 'project');
    expect(chip).toMatchObject({ label: 'Inbox Zero', value: '3', ambiguous: false });
  });

  it('offers prefix matches for a partially typed project', () => {
    const [chip] = only(parseCaptureDraft('Plan project:herm', CTX), 'project');
    expect(chip.options.map((o) => o.label)).toEqual(['Hermes', 'Hermes Mobile', 'Leave unfiled']);
  });

  it('resolves a known tag by its name and offers prefix matches', () => {
    const [chip] = only(parseCaptureDraft('Ship it #eng', CTX), 'tag');
    expect(chip).toMatchObject({ value: 'eng', ambiguous: false });
    expect(chip.options.map((o) => o.value)).toEqual(['eng', 'engagement']);
  });

  it('creates a brand-new tag name without asking, because the task still saves', () => {
    const [chip] = only(parseCaptureDraft('Ship it #brandnew', CTX), 'tag');
    expect(chip).toMatchObject({ value: 'brandnew', ambiguous: false });
    expect(chip.options.map((o) => o.value)).toEqual(['brandnew']);
  });
});

describe('priority parsing', () => {
  it.each([
    ['!high', 'high', 'High priority'],
    ['#urgent', 'high', 'High priority'],
    ['p1', 'high', 'High priority'],
    ['!medium', 'medium', 'Medium priority'],
    ['!med', 'medium', 'Medium priority'],
    ['p2', 'medium', 'Medium priority'],
    ['!low', 'low', 'Low priority'],
    ['#low', 'low', 'Low priority'],
    ['p3', 'low', 'Low priority'],
  ])('reads %s as priority %s', (token, value, label) => {
    const [chip] = only(parseCaptureDraft(`Fix the build ${token}`, CTX), 'priority');
    expect(chip).toMatchObject({ source: token, value, label, ambiguous: false });
  });

  it('claims "#urgent" as a priority chip, never as both a priority and a tag', () => {
    const chips = parseCaptureDraft('Fix the build #urgent', CTX);
    expect(only(chips, 'priority')).toHaveLength(1);
    expect(only(chips, 'tag')).toHaveLength(0);
  });

  it('leaves an unrelated "#" word alone', () => {
    expect(only(parseCaptureDraft('Fix the build #urgent', CTX), 'tag')).toHaveLength(0);
    expect(only(parseCaptureDraft('Fix #urgent now', CTX), 'priority')).toHaveLength(1);
  });
});

describe('the ambiguity gate', () => {
  it('returns exactly the chips that still need a human decision', () => {
    const chips = parseCaptureDraft('Standup friday at 3:30 #eng project:Zeus', CTX);
    const blocked = unresolvedChips(chips);
    expect(blocked.map((c) => c.source)).toEqual(['friday', '3:30', 'project:Zeus']);
  });

  it('a fully resolvable parse blocks nothing', () => {
    const chips = parseCaptureDraft('Review PR tomorrow 3pm 45m #eng project:Hermes', CTX);
    expect(unresolvedChips(chips)).toEqual([]);
  });

  it('a chip the user chose an option for stops blocking, even though it stays flagged ambiguous', () => {
    const [chip] = only(parseCaptureDraft('Standup friday', CTX), 'date');
    const chosen: CaptureChip = { ...chip, value: 'this friday' };
    expect(unresolvedChips([chosen])).toEqual([]);
  });

  it('removing a chip removes it from the gate — keeping the words as plain text is a valid answer', () => {
    const [chip] = only(parseCaptureDraft('Standup friday', CTX), 'date');
    const ignored: CaptureChip = { ...chip, removed: true };
    expect(unresolvedChips([ignored])).toEqual([]);
  });

  it('every unresolved chip offers at least one concrete option to choose from', () => {
    const chips = parseCaptureDraft('Standup friday at 3:30 for 2 project:Zeus', CTX);
    const blocked = unresolvedChips(chips);
    expect(blocked.length).toBeGreaterThan(0);
    for (const chip of blocked) {
      expect(chip.options.length, `${chip.source} offered no options`).toBeGreaterThan(0);
    }
  });
});

describe('span claiming and title stripping', () => {
  it('chip spans point back at the exact source text', () => {
    const text = 'Review PR tomorrow 3pm';
    for (const chip of parseCaptureDraft(text, CTX)) {
      expect(text.slice(chip.span.start, chip.span.end)).toBe(chip.source);
    }
  });

  it('chips come back ordered by position in the sentence', () => {
    const chips = parseCaptureDraft('#eng first, tomorrow, 25m last', CTX);
    const starts = chips.map((c) => c.span.start);
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);
  });

  it('repeated identical tokens get distinct keys', () => {
    const chips = parseCaptureDraft('Tag #eng then #eng again', CTX);
    const tags = only(chips, 'tag');
    expect(tags).toHaveLength(2);
    expect(new Set(tags.map((c) => c.key)).size).toBe(2);
  });

  it('stripChipSpans leaves everything it was not told about', () => {
    const text = 'Review PR tomorrow 3pm';
    const chips = only(parseCaptureDraft(text, CTX), 'date');
    expect(stripChipSpans(text, chips)).toBe('Review PR 3pm');
  });

  it('stripChipSpans collapses the whitespace left behind by the removals', () => {
    const text = 'Plan    the thing';
    expect(stripChipSpans(text, [])).toBe('Plan the thing');
  });

  it('the parser does not mutate the caller context', () => {
    const snapshot = structuredClone(CTX);
    analyseCaptureDraft('#eng project:Hermes', CTX);
    expect(CTX).toEqual(snapshot);
  });
});