import { describe, expect, it } from "vitest";
import {
  DEFAULT_TIME_ZONE,
  computeOnPace,
  currentMonthInZone,
  currentMonthStartUtc,
  getDaysInMonth,
  getElapsedDays,
  localDateInZone,
  resolveDayWindow,
  resolveMonthWindow,
} from "./month-window";

describe("currentMonthStartUtc — the month boundary in a PINNED zone", () => {
  /**
   * The spend window has to be a fixed instant, computed in a zone we choose,
   * not a database-side `date_trunc('month', now())` — which truncates in the
   * CONNECTION's `TimeZone` setting and therefore moves with the pool.
   *
   * For `Asia/Kolkata` the first 5h30m of a calendar month belong to the NEW
   * month: a row written at 02:00 IST on the 1st is in the new month, not the
   * previous one.
   */
  it("puts 02:00 IST on the 1st in the NEW month, not the previous one", () => {
    const at = new Date("2026-10-01T02:00:00+05:30"); // 2026-09-30T20:30:00Z
    const start = currentMonthStartUtc(DEFAULT_TIME_ZONE, at);

    expect(start.toISOString()).toBe("2026-09-30T18:30:00.000Z");
    expect(at.getTime()).toBeGreaterThanOrEqual(start.getTime());
  });

  it("keeps 23:59 IST on the last day of September in September, not in October", () => {
    const at = new Date("2026-09-30T23:59:00+05:30"); // 2026-09-30T18:29:00Z
    const start = currentMonthStartUtc(DEFAULT_TIME_ZONE, at);

    expect(start.toISOString()).toBe("2026-08-31T18:30:00.000Z");
    expect(at.getTime()).toBeGreaterThanOrEqual(start.getTime());
    // October's window has not opened yet: it opens a minute later.
    const octoberStart = currentMonthStartUtc(
      DEFAULT_TIME_ZONE,
      new Date("2026-10-01T00:00:00+05:30"),
    );
    expect(octoberStart.toISOString()).toBe("2026-09-30T18:30:00.000Z");
    expect(at.getTime()).toBeLessThan(octoberStart.getTime());
  });

  it("is a fixed instant, so the pinned zone decides the boundary", () => {
    const at = new Date("2026-10-01T02:00:00+05:30"); // 2026-09-30T20:30:00Z
    const kolkata = currentMonthStartUtc(DEFAULT_TIME_ZONE, at);
    const utc = currentMonthStartUtc("UTC", at);

    expect(kolkata.toISOString()).toBe("2026-09-30T18:30:00.000Z");
    // In UTC the very same instant is still 30 September, so a UTC window
    // would have dropped a row written at 02:00 IST on the 1st from this
    // month's figure.
    expect(utc.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(kolkata.getTime()).toBeGreaterThan(utc.getTime());
  });

  it("returns the start of the month that CONTAINS the instant it is given", () => {
    // Self-consistency: whatever month the returned instant lands in, it is
    // the first instant of that month in the same zone.
    for (const iso of [
      "2026-01-01T02:00:00+05:30",
      "2026-03-31T23:00:00+05:30",
      "2026-10-01T02:00:00+05:30",
      "2026-12-31T23:59:59+05:30",
    ]) {
      const at = new Date(iso);
      const start = currentMonthStartUtc(DEFAULT_TIME_ZONE, at);
      expect(currentMonthStartUtc(DEFAULT_TIME_ZONE, start).toISOString()).toBe(
        start.toISOString(),
      );
      expect(start.getTime()).toBeLessThanOrEqual(at.getTime());
    }
  });
});

describe("month-window timezone math", () => {
  it("matches authoritative regression fixtures from Section 8.1 of the spec", () => {
    // 1. Asia/Kolkata (fixed +05:30)
    const kolkataJan = resolveMonthWindow("2026-01", "Asia/Kolkata");
    expect(kolkataJan.start.toISOString()).toBe("2025-12-31T18:30:00.000Z");
    expect(kolkataJan.end.toISOString()).toBe("2026-01-31T18:30:00.000Z");

    // 2. America/New_York in January (EST -05:00)
    const nyJan = resolveMonthWindow("2026-01", "America/New_York");
    expect(nyJan.start.toISOString()).toBe("2026-01-01T05:00:00.000Z");

    // 3. America/New_York in July (EDT -04:00)
    const nyJul = resolveMonthWindow("2026-07", "America/New_York");
    expect(nyJul.start.toISOString()).toBe("2026-07-01T04:00:00.000Z");

    // 4. America/New_York in December (year rollover to next year Jan 1 EST -05:00)
    const nyDec = resolveMonthWindow("2026-12", "America/New_York");
    expect(nyDec.end.toISOString()).toBe("2027-01-01T05:00:00.000Z");

    // 5. Australia/Sydney in January (AEDT +11:00)
    const sydneyJan = resolveMonthWindow("2026-01", "Australia/Sydney");
    expect(sydneyJan.start.toISOString()).toBe("2025-12-31T13:00:00.000Z");

    // 6. Pacific/Chatham in January (+13:45 daylight)
    const chathamJan = resolveMonthWindow("2026-01", "Pacific/Chatham");
    expect(chathamJan.start.toISOString()).toBe("2025-12-31T10:15:00.000Z");

    // 7. Pacific/Chatham in July (+12:45 standard)
    const chathamJul = resolveMonthWindow("2026-07", "Pacific/Chatham");
    expect(chathamJul.start.toISOString()).toBe("2026-06-30T11:15:00.000Z");
  });

  it("verifies windows are contiguous across adjacent months (window(N).end === window(N+1).start)", () => {
    const testZones = [
      "Asia/Kolkata",
      "America/New_York",
      "Europe/London",
      "Pacific/Chatham",
      "Australia/Sydney",
    ];

    const months = [
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
      "2026-10",
      "2026-11",
      "2026-12",
    ];

    for (const tz of testZones) {
      for (let i = 0; i < months.length - 1; i++) {
        const cur = resolveMonthWindow(months[i], tz);
        const next = resolveMonthWindow(months[i + 1], tz);
        expect(cur.end.toISOString()).toBe(next.start.toISOString());
      }
    }
  }, 15_000);

  it("calculates accurate days in month including leap years", () => {
    expect(getDaysInMonth("2026-01")).toBe(31);
    expect(getDaysInMonth("2026-02")).toBe(28); // Non-leap year
    expect(getDaysInMonth("2024-02")).toBe(29); // Leap year 2024
    expect(getDaysInMonth("2000-02")).toBe(29); // 400-year leap year
    expect(getDaysInMonth("1900-02")).toBe(28); // Century non-leap year
    expect(getDaysInMonth("2026-04")).toBe(30);
  });

  it("validates and rejects invalid input formats and unknown timezones", () => {
    expect(() => resolveMonthWindow("2026-1", "Asia/Kolkata")).toThrow(
      /Invalid month format/,
    );
    expect(() => resolveMonthWindow("2026-13", "Asia/Kolkata")).toThrow(
      /Invalid month format/,
    );
    expect(() => resolveMonthWindow("invalid", "Asia/Kolkata")).toThrow(
      /Invalid month format/,
    );
    expect(() => resolveMonthWindow("2026-01", "Mars/Olympus")).toThrow(
      /Invalid IANA timeZone/,
    );
  });

  it("resolves day windows accurately and contiguously", () => {
    const instant = new Date("2026-04-15T12:00:00Z");
    const day = resolveDayWindow(instant, "Asia/Kolkata");
    expect(day.start.toISOString()).toBe("2026-04-14T18:30:00.000Z");
    expect(day.end.toISOString()).toBe("2026-04-15T18:30:00.000Z");

    const nextInstant = new Date("2026-04-16T02:00:00Z");
    const nextDay = resolveDayWindow(nextInstant, "Asia/Kolkata");
    expect(day.end.toISOString()).toBe(nextDay.start.toISOString());
  });

  it("formats localDateInZone and currentMonthInZone correctly", () => {
    // 2026-01-01 at 01:00 UTC is already 06:30 AM in Kolkata on 2026-01-01,
    // but 20:00 PM on 2025-12-31 in New York
    const instant = new Date("2026-01-01T01:00:00Z");
    expect(localDateInZone(instant, "Asia/Kolkata")).toBe("2026-01-01");
    expect(localDateInZone(instant, "America/New_York")).toBe("2025-12-31");

    expect(currentMonthInZone("Asia/Kolkata", instant)).toBe("2026-01");
    expect(currentMonthInZone("America/New_York", instant)).toBe("2025-12");
  });

  it("calculates on-pace projection accurately", () => {
    // Target 30 focus sessions in 30 days
    // Day 15: expected 15
    const paceAt15 = computeOnPace(30, 16, 15, 30);
    expect(paceAt15.expectedSoFar).toBe(15);
    expect(paceAt15.onPace).toBe(true);
    expect(paceAt15.progress).toBe(53.3);

    const behindPace = computeOnPace(30, 14, 15, 30);
    expect(behindPace.expectedSoFar).toBe(15);
    expect(behindPace.onPace).toBe(false);

    // Final day: expected equals target exactly
    const finalDay = computeOnPace(30, 30, 30, 30);
    expect(finalDay.expectedSoFar).toBe(30);
    expect(finalDay.onPace).toBe(true);
  });
});
