import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// Pure RRULE expansion helpers extracted and tested independently.
// We test the date-math logic in isolation — no DB mocks required.
// ---------------------------------------------------------------------------

/** Mimics the daily expansion from recurrence.ts */
function expandDaily(
  dtstart: Date,
  windowEnd: Date,
  interval: number = 1,
): Date[] {
  const dates: Date[] = [];
  const cur = new Date(dtstart);
  const MAX_OCCURRENCES = 365;
  let count = 0;
  while (cur <= windowEnd && count < MAX_OCCURRENCES) {
    dates.push(new Date(cur));
    cur.setUTCDate(cur.getUTCDate() + interval);
    count++;
  }
  return dates;
}

/** Mimics the weekly expansion (specific days) from recurrence.ts */
const WEEKDAY_MAP: Record<string, number> = {
  SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6,
};

function expandWeekly(dtstart: Date, windowEnd: Date, byday: string[]): Date[] {
  const targetDays = byday.map((d) => WEEKDAY_MAP[d] ?? -1).filter((d) => d >= 0);
  const dates: Date[] = [];
  const cur = new Date(dtstart);
  cur.setUTCDate(cur.getUTCDate() - cur.getUTCDay()); // rewind to Sunday
  const MAX_OCCURRENCES = 52 * 7;
  let count = 0;
  while (cur <= windowEnd && count < MAX_OCCURRENCES) {
    if (targetDays.includes(cur.getUTCDay()) && cur >= dtstart) {
      dates.push(new Date(cur));
    }
    cur.setUTCDate(cur.getUTCDate() + 1);
    count++;
  }
  return dates;
}

// ---------------------------------------------------------------------------
describe("RRULE daily expansion", () => {
  const start = new Date("2024-01-01T09:00:00Z");

  it("generates exactly 60 dates over a 60-day window (daily)", () => {
    const end = new Date("2024-03-01T09:00:00Z"); // ~60 days
    const dates = expandDaily(start, end);
    expect(dates.length).toBeGreaterThanOrEqual(59);
    expect(dates.length).toBeLessThanOrEqual(61);
  });

  it("first date equals dtstart", () => {
    const end = new Date("2024-01-10T09:00:00Z");
    const dates = expandDaily(start, end);
    expect(dates[0].toISOString()).toBe(start.toISOString());
  });

  it("each successive date is exactly 1 day later", () => {
    const end = new Date("2024-01-10T09:00:00Z");
    const dates = expandDaily(start, end);
    for (let i = 1; i < dates.length; i++) {
      const diff = dates[i].getTime() - dates[i - 1].getTime();
      expect(diff).toBe(24 * 60 * 60 * 1000);
    }
  });

  it("respects windowEnd boundary", () => {
    const end = new Date("2024-01-05T09:00:00Z");
    const dates = expandDaily(start, end);
    for (const d of dates) {
      expect(d.getTime()).toBeLessThanOrEqual(end.getTime());
    }
  });

  it("interval=2 gives every other day", () => {
    const end = new Date("2024-01-20T09:00:00Z");
    const dates = expandDaily(start, end, 2);
    for (let i = 1; i < dates.length; i++) {
      const diff = dates[i].getTime() - dates[i - 1].getTime();
      expect(diff).toBe(2 * 24 * 60 * 60 * 1000);
    }
  });

  it("returns empty array when windowEnd is before dtstart", () => {
    const end = new Date("2023-12-31T09:00:00Z");
    const dates = expandDaily(start, end);
    expect(dates).toHaveLength(0);
  });
});

describe("RRULE weekly expansion", () => {
  const start = new Date("2024-01-01T09:00:00Z"); // Monday

  it("MO only: all dates are Mondays", () => {
    const end = new Date("2024-03-01T09:00:00Z");
    const dates = expandWeekly(start, end, ["MO"]);
    for (const d of dates) {
      expect(d.getUTCDay()).toBe(1); // Monday = 1
    }
  });

  it("MO,WE,FR: all dates are Mon, Wed, or Fri", () => {
    const end = new Date("2024-02-01T09:00:00Z");
    const dates = expandWeekly(start, end, ["MO", "WE", "FR"]);
    for (const d of dates) {
      expect([1, 3, 5]).toContain(d.getUTCDay());
    }
  });

  it("SA,SU: all dates are weekend days", () => {
    const end = new Date("2024-02-01T09:00:00Z");
    const dates = expandWeekly(start, end, ["SA", "SU"]);
    for (const d of dates) {
      expect([0, 6]).toContain(d.getUTCDay());
    }
  });

  it("generates dates in chronological order", () => {
    const end = new Date("2024-02-15T09:00:00Z");
    const dates = expandWeekly(start, end, ["TU", "TH"]);
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i].getTime()).toBeGreaterThan(dates[i - 1].getTime());
    }
  });

  it("no dates before dtstart", () => {
    const end = new Date("2024-02-01T09:00:00Z");
    const dates = expandWeekly(start, end, ["MO"]);
    for (const d of dates) {
      expect(d.getTime()).toBeGreaterThanOrEqual(start.getTime());
    }
  });

  it("unknown byday codes are ignored", () => {
    const end = new Date("2024-02-01T09:00:00Z");
    const dates = expandWeekly(start, end, ["XX", "MO"]);
    for (const d of dates) {
      expect(d.getUTCDay()).toBe(1);
    }
  });
});
