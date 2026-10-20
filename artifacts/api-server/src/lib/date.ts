const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseDateParts(value: string) {
  if (!DATE_PATTERN.test(value)) {
    throw new Error("Invalid calendar date");
  }

  const [year, month, day] = value.split("-").map(Number);
  return { year, month, day };
}

function nextCalendarDate(value: string) {
  const { year, month, day } = parseDateParts(value);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return next.toISOString().slice(0, 10);
}

export function timeZoneOffsetMs(timestamp: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(timestamp));

  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );

  return (
    Date.UTC(
      values.year,
      values.month - 1,
      values.day,
      values.hour,
      values.minute,
      values.second,
    ) - timestamp
  );
}

function localMidnightToUtc(value: string, timeZone: string) {
  const { year, month, day } = parseDateParts(value);
  const utcGuess = Date.UTC(year, month - 1, day);
  const offset = timeZoneOffsetMs(utcGuess, timeZone);
  return new Date(utcGuess - offset);
}

export function normalizeTimeZone(value: string | undefined) {
  const candidate = value?.trim() || "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format();
    return candidate;
  } catch {
    return "UTC";
  }
}

/** The wall-calendar date (year/month/day) that an instant lands on in a
 *  given IANA zone. Complements `zonedWallToUtc` (natural-date.ts), which
 *  converts wall slots back to instants. Structural type on purpose: avoids a
 *  module cycle with natural-date.ts, which imports `timeZoneOffsetMs` from here. */
export function zonedWallDate(
  instant: Date,
  timeZone: string,
): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const values = Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]),
  );
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
  };
}

export function dayBounds(date: string | undefined, timeZone?: string) {
  const zone = normalizeTimeZone(timeZone);
  const value =
    date ??
    (() => {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: zone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(new Date());
      const values = Object.fromEntries(
        parts
          .filter((part) => part.type !== "literal")
          .map((part) => [part.type, part.value]),
      );
      return `${values.year}-${values.month}-${values.day}`;
    })();
  const start = localMidnightToUtc(value, zone);
  const end = localMidnightToUtc(nextCalendarDate(value), zone);
  return { start, end, timeZone: zone, date: value };
}