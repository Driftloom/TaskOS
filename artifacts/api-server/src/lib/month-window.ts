/**
 * Month window and local timezone calculation utilities for Monthly Goals.
 *
 * Implements exact half-open [start, end) interval resolution in user IANA timezones,
 * avoiding hardcoded UTC offset bugs and DST skew.
 */

export interface MonthWindow {
  start: Date; // UTC instant corresponding to 00:00:00.000 on the 1st in userTz
  end: Date;   // UTC instant corresponding to 00:00:00.000 on the 1st of next month in userTz
}

export interface DayWindow {
  start: Date; // UTC instant corresponding to 00:00:00.000 on that date in userTz
  end: Date;   // UTC instant corresponding to 00:00:00.000 on the next date in userTz
}

export function validateTimeZone(timeZone: string): void {
  if (!timeZone || typeof timeZone !== "string") {
    throw new Error(`Invalid IANA timeZone "${timeZone}".`);
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
  } catch {
    throw new Error(`Invalid IANA timeZone "${timeZone}".`);
  }
}

export function wallClockDateToUtc(
  year: number,
  month: number, // 1-12
  day: number,
  timeZone: string,
): Date {
  validateTimeZone(timeZone);
  const naive = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  const offsetAt = (instant: Date): number => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(instant);
    const get = (t: string): number => Number(parts.find((p) => p.type === t)!.value);
    const asUtc = Date.UTC(
      get("year"),
      get("month") - 1,
      get("day"),
      get("hour") === 24 ? 0 : get("hour"),
      get("minute"),
      get("second"),
    );
    return asUtc - instant.getTime();
  };

  let instant = new Date(naive);
  for (let i = 0; i < 2; i++) {
    const off = offsetAt(instant);
    const next = new Date(naive - off);
    if (next.getTime() === instant.getTime()) break;
    instant = next;
  }
  return instant;
}

/**
 * Resolve exact UTC [start, end) interval for a calendar month in an IANA timezone.
 */
export function resolveMonthWindow(isoMonth: string, timeZone: string): MonthWindow {
  if (!/^[0-9]{4}-(0[1-9]|1[0-2])$/.test(isoMonth)) {
    throw new Error(`Invalid month format "${isoMonth}". Expected "YYYY-MM".`);
  }
  validateTimeZone(timeZone);
  const [yearStr, monthStr] = isoMonth.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);

  const start = wallClockDateToUtc(year, month, 1, timeZone);
  const end =
    month === 12
      ? wallClockDateToUtc(year + 1, 1, 1, timeZone)
      : wallClockDateToUtc(year, month + 1, 1, timeZone);

  return { start, end };
}

/**
 * Local calendar day for an instant, formatted as YYYY-MM-DD.
 */
export function localDateInZone(instant: Date, timeZone: string): string {
  validateTimeZone(timeZone);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/**
 * Current month as YYYY-MM in the user's timezone.
 */
export function currentMonthInZone(timeZone: string, now: Date = new Date()): string {
  validateTimeZone(timeZone);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
  })
    .format(now)
    .slice(0, 7);
}

/**
 * Resolve exact UTC [start, end) interval for the calendar day of an instant in an IANA timezone.
 */
export function resolveDayWindow(instant: Date, timeZone: string): DayWindow {
  validateTimeZone(timeZone);
  const dateStr = localDateInZone(instant, timeZone);
  const [yearStr, monthStr, dayStr] = dateStr.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);

  const start = wallClockDateToUtc(year, month, day, timeZone);
  const nextDate = new Date(Date.UTC(year, month - 1, day + 1));
  const end = wallClockDateToUtc(
    nextDate.getUTCFullYear(),
    nextDate.getUTCMonth() + 1,
    nextDate.getUTCDate(),
    timeZone,
  );

  return { start, end };
}

/**
 * Returns total days in the given YYYY-MM month (28, 29, 30, 31).
 */
export function getDaysInMonth(isoMonth: string): number {
  if (!/^[0-9]{4}-(0[1-9]|1[0-2])$/.test(isoMonth)) {
    throw new Error(`Invalid month format "${isoMonth}". Expected "YYYY-MM".`);
  }
  const [yearStr, monthStr] = isoMonth.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Returns elapsed calendar days in the month relative to a point in time in the user's timezone.
 */
export function getElapsedDays(
  isoMonth: string,
  timeZone: string,
  now: Date = new Date(),
): number {
  const currentMonth = currentMonthInZone(timeZone, now);
  const totalDays = getDaysInMonth(isoMonth);
  if (isoMonth < currentMonth) {
    return totalDays;
  }
  if (isoMonth > currentMonth) {
    return 0;
  }
  const localDay = Number(localDateInZone(now, timeZone).split("-")[2]);
  return Math.min(Math.max(localDay, 1), totalDays);
}

/**
 * Compute on-pace expected progress for a goal based on elapsed days.
 */
export function computeOnPace(
  target: number,
  actual: number,
  elapsedDays: number,
  totalDays: number,
): {
  expectedSoFar: number;
  onPace: boolean;
  progress: number;
} {
  const progress =
    target > 0 ? Number(((actual / target) * 100).toFixed(1)) : 0;
  if (totalDays <= 0 || elapsedDays <= 0) {
    return {
      expectedSoFar: 0,
      onPace: true,
      progress,
    };
  }
  const expectedSoFar = Math.round(target * (elapsedDays / totalDays));
  const onPace = actual >= expectedSoFar;
  return {
    expectedSoFar,
    onPace,
    progress,
  };
}
