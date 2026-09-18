import { normalizeTimeZone, timeZoneOffsetMs } from "./date";

/**
 * Deterministic English natural-language date parser for task capture.
 *
 * Supported grammar (case-insensitive; commas and ordinals like "20th" ignored):
 *   date : "today" | "tomorrow" | "tmr" | "tmrw" | "yesterday"
 *        | "day after tomorrow"
 *        | ["next"] weekday            ("mon".."sun", full names ok)
 *        | "YYYY-MM-DD" | "MMM D [YYYY]" | "D MMM [YYYY]"
 *        | "in" N ("minute"|"hour"|"day"|"week")["s"] ["from now"]
 *        | "next week"
 *   time : "H[‍:MM]am|pm" | "HH:MM" (24h) | "noon" | "midnight"
 *        | "morning" (09:00) | "afternoon" (14:00) | "evening" (18:00)
 *        | "eod" | "end of day" (18:00) | "tonight" (20:00, always today)
 *   input: [date] [("at"|"on")] [time]   (either order)
 *
 * Determinism contract (every rule below has a unit test):
 * - No date          -> zone-today. No time -> 09:00 local. Past results are
 *   KEPT (overdue capture is legitimate) except: dateless clock times roll to
 *   the next future occurrence (+1 day), and a bare weekday whose time already
 *   passed rolls +7 days. "tonight" never rolls (always today 20:00).
 * - Bare weekday = nearest date >= today with that weekday; "next X" = +7d.
 * - Year omitted on explicit dates -> nearest future occurrence.
 * - "midnight" = 00:00 (dateless -> next future midnight via the time rule).
 * - Two clock times, two dates, or any leftover words -> null (400 upstream).
 * - "MM/DD"-style numeric dates are NOT supported (US/EU ambiguity).
 * - Time-zone wall time -> UTC uses offset iteration: normal times converge;
 *   spring-forward gaps resolve to the post-transition instant; fall-back
 *   ambiguities resolve to the first occurrence.
 */
export interface ParseOptions {
  now: Date;
  timeZone: string;
}

const MONTHS: Record<string, number> = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4,
  may: 5, june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8,
  september: 9, sep: 9, sept: 9, october: 10, oct: 10, november: 11, nov: 11,
  december: 12, dec: 12,
};

const WEEKDAYS: Record<string, number> = {
  sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3, weds: 3, thursday: 4, thu: 4, thurs: 4,
  friday: 5, fri: 5, saturday: 6, sat: 6,
};

const DEFAULT_HOUR = 9;
const DEFAULT_MINUTE = 0;

interface ZoneCalendar {
  year: number;
  month: number;
  day: number;
}

function zoneToday(now: Date, timeZone: string): ZoneCalendar {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(now);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

function addDays(date: ZoneCalendar, delta: number): ZoneCalendar {
  const rolled = new Date(Date.UTC(date.year, date.month - 1, date.day + delta));
  return {
    year: rolled.getUTCFullYear(),
    month: rolled.getUTCMonth() + 1,
    day: rolled.getUTCDate(),
  };
}

function cmp(a: ZoneCalendar, b: ZoneCalendar): number {
  return (
    a.year - b.year || a.month - b.month || a.day - b.day
  );
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

/** Zone wall-clock -> UTC instant. Converges for normal times; skipped-gap
 *  times oscillate, so after bounded iteration the later (post-transition)
 *  instant wins. Fall-back ambiguities converge on the first occurrence. */
export function zonedWallToUtc(
  date: ZoneCalendar,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const wallMs = Date.UTC(date.year, date.month - 1, date.day, hour, minute);
  let guess = wallMs;
  let prev = Number.NaN;
  for (let i = 0; i < 4; i += 1) {
    const next = wallMs - timeZoneOffsetMs(guess, timeZone);
    if (next === guess || next === prev) {
      guess = Math.max(guess, next);
      break;
    }
    prev = guess;
    guess = next;
  }
  return new Date(guess);
}

interface TimeToken {
  hour: number;
  minute: number;
}

function extractTimes(text: string): { times: TimeToken[]; rest: string } {
  const times: TimeToken[] = [];
  let rest = ` ${text} `;

  const take12h = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)/;
  let m = take12h.exec(rest);
  while (m) {
    const hour12 = Number(m[1]);
    const minute = m[2] === undefined ? 0 : Number(m[2]);
    if (hour12 < 1 || hour12 > 12 || minute > 59) return { times: [], rest: text };
    const hour = hour12 % 12 + (m[3] === "pm" ? 12 : 0);
    times.push({ hour, minute });
    rest = rest.replace(m[0], " ");
    m = take12h.exec(rest);
  }

  const take24h = /(?<!\d)([01]?\d|2[0-3]):([0-5]\d)(?!\d)/;
  m = take24h.exec(rest);
  while (m) {
    times.push({ hour: Number(m[1]), minute: Number(m[2]) });
    rest = rest.replace(m[0], " ");
    m = take24h.exec(rest);
  }

  const named: Array<[RegExp, TimeToken]> = [
    [/\bnoon\b/, { hour: 12, minute: 0 }],
    [/\bmidnight\b/, { hour: 0, minute: 0 }],
    [/\bmorning\b/, { hour: 9, minute: 0 }],
    [/\bafternoon\b/, { hour: 14, minute: 0 }],
    [/\bevening\b/, { hour: 18, minute: 0 }],
    [/\bend of day\b/, { hour: 18, minute: 0 }],
    [/\beod\b/, { hour: 18, minute: 0 }],
  ];
  for (const [pattern, token] of named) {
    if (pattern.test(rest)) {
      times.push(token);
      rest = rest.replace(pattern, " ");
    }
  }
  return { times, rest };
}

interface DateToken {
  date: ZoneCalendar;
  /** Bare weekdays may roll +7d when the combined time already passed. */
  weekRoll: boolean;
}

function extractDate(
  text: string,
  today: ZoneCalendar,
): { dates: DateToken[]; rest: string; tonight: boolean } {
  const dates: DateToken[] = [];
  let rest = ` ${text} `;
  let tonight = false;

  if (/\btonight\b/.test(rest)) {
    tonight = true;
    rest = rest.replace(/\btonight\b/, " ");
  }

  const simple: Array<[RegExp, (t: ZoneCalendar) => ZoneCalendar]> = [
    [/\bday after tomorrow\b/, (t) => addDays(t, 2)],
    [/\btomorrow\b/, (t) => addDays(t, 1)],
    [/\btmrw\b/, (t) => addDays(t, 1)],
    [/\btmr\b/, (t) => addDays(t, 1)],
    [/\byesterday\b/, (t) => addDays(t, -1)],
    [/\btoday\b/, (t) => t],
    [/\bnext week\b/, (t) => addDays(t, 7)],
  ];
  for (const [pattern, resolve] of simple) {
    if (pattern.test(rest)) {
      dates.push({ date: resolve(today), weekRoll: false });
      rest = rest.replace(pattern, " ");
    }
  }

  const weekday = /\b(next\s+)?(sunday|sun|monday|mon|tuesday|tue|tues|wednesday|wed|weds|thursday|thu|thurs|friday|fri|saturday|sat)\b/;
  let m = weekday.exec(rest);
  while (m) {
    const target = WEEKDAYS[m[2]]!;
    const todayDow = new Date(
      Date.UTC(today.year, today.month - 1, today.day),
    ).getUTCDay();
    const delta = (target - todayDow + 7) % 7;
    const date = addDays(today, delta + (m[1] ? 7 : 0));
    dates.push({ date, weekRoll: !m[1] });
    rest = rest.replace(m[0], " ");
    m = weekday.exec(rest);
  }

  const iso = /(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/;
  m = iso.exec(rest);
  while (m) {
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    if (!isValidCalendarDate(year, month, day)) {
      return { dates: [], rest: text, tonight };
    }
    dates.push({ date: { year, month, day }, weekRoll: false });
    rest = rest.replace(m[0], " ");
    m = iso.exec(rest);
  }

  const monthName = Object.keys(MONTHS).join("|");
  const mmmFirst = new RegExp(
    `\\b(${monthName})\\s+(\\d{1,2})(?:\\s+(\\d{4}))?\\b`,
  );
  m = mmmFirst.exec(rest);
  while (m) {
    const month = MONTHS[m[1]]!;
    const day = Number(m[2]);
    let year =
      m[3] === undefined
        ? today.year
        : Number(m[3]);
    if (m[3] === undefined) {
      if (
        !isValidCalendarDate(year, month, day) ||
        cmp({ year, month, day }, today) < 0
      ) {
        year += 1;
      }
    }
    if (!isValidCalendarDate(year, month, day)) {
      return { dates: [], rest: text, tonight };
    }
    dates.push({ date: { year, month, day }, weekRoll: false });
    rest = rest.replace(m[0], " ");
    m = mmmFirst.exec(rest);
  }

  const dayFirst = new RegExp(
    `(?<!\\d)(\\d{1,2})\\s+(${monthName})(?:\\s+(\\d{4}))?\\b`,
  );
  m = dayFirst.exec(rest);
  while (m) {
    const day = Number(m[1]);
    const month = MONTHS[m[2]]!;
    let year =
      m[3] === undefined
        ? today.year
        : Number(m[3]);
    if (m[3] === undefined) {
      if (
        !isValidCalendarDate(year, month, day) ||
        cmp({ year, month, day }, today) < 0
      ) {
        year += 1;
      }
    }
    if (!isValidCalendarDate(year, month, day)) {
      return { dates: [], rest: text, tonight };
    }
    dates.push({ date: { year, month, day }, weekRoll: false });
    rest = rest.replace(m[0], " ");
    m = dayFirst.exec(rest);
  }

  return { dates, rest, tonight };
}

export function parseNaturalDate(
  text: string,
  options: ParseOptions,
): Date | null {
  const { now, timeZone: rawTimeZone } = options;
  const timeZone = normalizeTimeZone(rawTimeZone);
  const today = zoneToday(now, timeZone);

  let normalized = text.trim().toLowerCase();
  if (!normalized) return null;
  normalized = normalized
    .replace(/,/g, " ")
    .replace(/\b(\d+)(st|nd|rd|th)\b/g, "$1")
    .replace(/\bin\s+(a|an)\b/g, "in 1")
    .replace(/\s+/g, " ")
    .trim();

  const relative =
    /^in\s+(\d+)\s+(minutes?|mins?|hours?|hrs?|days?|weeks?)(?:\s+from\s+now)?$/.exec(
      normalized,
    );
  if (relative) {
    const amount = Number(relative[1]);
    const unit = relative[2];
    const ms =
      unit.startsWith("min")
        ? amount * 60_000
        : unit.startsWith("h")
          ? amount * 3_600_000
          : unit.startsWith("w")
            ? amount * 7 * 86_400_000
            : amount * 86_400_000;
    return new Date(now.getTime() + ms);
  }

  const { times, rest: afterTime } = extractTimes(normalized);
  if (times.length > 1) return null;
  const { dates, rest: afterDate, tonight } = extractDate(afterTime, today);
  if (dates.length > 1) return null;

  const leftover = afterDate
    .replace(/^\s*(at|on)\b/, " ")
    .replace(/\b(at|on)\s*$/, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (leftover) return null;

  let time: TimeToken;
  if (times[0]) {
    time = times[0];
  } else if (tonight) {
    time = { hour: 20, minute: 0 };
  } else {
    time = { hour: DEFAULT_HOUR, minute: DEFAULT_MINUTE };
  }
  const dateToken = dates[0];
  const date = dateToken?.date ?? today;
  if (tonight && dateToken) return null;

  const instant = zonedWallToUtc(date, time.hour, time.minute, timeZone);
  if (tonight) return instant;
  if (!dateToken && instant.getTime() <= now.getTime()) {
    return zonedWallToUtc(
      addDays(date, 1),
      time.hour,
      time.minute,
      timeZone,
    );
  }
  if (dateToken?.weekRoll && instant.getTime() <= now.getTime()) {
    return zonedWallToUtc(
      addDays(date, 7),
      time.hour,
      time.minute,
      timeZone,
    );
  }
  return instant;
}

export type ResolveDueInput =
  | { kind: "keep" }
  | { kind: "set"; dueAt: Date }
  | { kind: "error"; error: string };

/** Precedence for task writes: explicit dueAt and dueText are mutually
 *  exclusive; blank dueText counts as absent; unparseable text is an error,
 *  never a silent null. */
export function resolveDueInput(input: {
  dueAt?: Date | null;
  dueText?: string | null;
  timezone?: string;
  now?: Date;
}): ResolveDueInput {
  const dueAt = input.dueAt ?? null;
  const rawText = input.dueText ?? null;
  const dueText = rawText?.trim() ? rawText.trim() : null;

  if (dueAt && dueText) {
    return {
      kind: "error",
      error: "dueAt and dueText are mutually exclusive: send exactly one.",
    };
  }
  if (dueAt) return { kind: "set", dueAt };
  if (!dueText) return { kind: "keep" };

  const parsed = parseNaturalDate(dueText, {
    now: input.now ?? new Date(),
    timeZone: input.timezone ?? "UTC",
  });
  if (!parsed) {
    const shown = dueText.length > 60 ? `${dueText.slice(0, 60)}…` : dueText;
    return {
      kind: "error",
      error: `unparseable_due_text: could not understand "${shown}". Try "tomorrow 5pm".`,
    };
  }
  return { kind: "set", dueAt: parsed };
}
