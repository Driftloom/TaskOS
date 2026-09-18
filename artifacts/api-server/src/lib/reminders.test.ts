import { describe, expect, it } from "vitest";
import {
  computeTiers,
  hourInZone,
  inQuietHours,
  isExpired,
  MAX_OVERDUE_MS,
  nextAllowedTime,
} from "./reminders";

const NOW = new Date("2026-09-17T10:30:00.000Z"); // Thursday
const WINDOW = { quietStart: 22, quietEnd: 7, timeZone: "UTC" };

describe("computeTiers", () => {
  it("emits T-1d, T-1h and at-time for a future due date", () => {
    const due = new Date("2026-09-20T12:00:00.000Z");
    expect(computeTiers(due, NOW)).toEqual([
      { name: "t_1day", at: new Date("2026-09-19T12:00:00.000Z") },
      { name: "t_1hour", at: new Date("2026-09-20T11:00:00.000Z") },
      { name: "at_time", at: due },
    ]);
  });
  it("skips tiers already past, never backfills", () => {
    const due = new Date("2026-09-17T12:00:00.000Z");
    expect(computeTiers(due, NOW).map((t) => t.name)).toEqual([
      "t_1hour",
      "at_time",
    ]);
    expect(computeTiers(new Date("2026-09-17T10:00:00.000Z"), NOW)).toEqual([]);
  });
});

describe("inQuietHours", () => {
  it("handles normal and overnight windows", () => {
    expect(inQuietHours(new Date("2026-09-17T23:00:00Z"), WINDOW)).toBe(true);
    expect(inQuietHours(new Date("2026-09-17T06:59:00Z"), WINDOW)).toBe(true);
    expect(inQuietHours(new Date("2026-09-17T07:00:00Z"), WINDOW)).toBe(false);
    expect(inQuietHours(new Date("2026-09-17T12:00:00Z"), WINDOW)).toBe(false);
    expect(
      inQuietHours(new Date("2026-09-17T12:00:00Z"), {
        quietStart: 13,
        quietEnd: 14,
        timeZone: "UTC",
      }),
    ).toBe(false);
    expect(
      inQuietHours(new Date("2026-09-17T13:30:00Z"), {
        quietStart: 13,
        quietEnd: 14,
        timeZone: "UTC",
      }),
    ).toBe(true);
  });
  it("start == end disables quiet entirely", () => {
    expect(
      inQuietHours(NOW, { quietStart: 0, quietEnd: 0, timeZone: "UTC" }),
    ).toBe(false);
  });
  it("evaluates in the user's zone", () => {
    // 10:30Z = 16:00 IST: inside 15-17 IST, outside 22-7 UTC reading.
    expect(
      inQuietHours(NOW, { quietStart: 15, quietEnd: 17, timeZone: "Asia/Kolkata" }),
    ).toBe(true);
    expect(inQuietHours(NOW, { ...WINDOW, timeZone: "Asia/Kolkata" })).toBe(false);
  });
});

describe("nextAllowedTime", () => {
  it("passes through outside quiet", () => {
    expect(nextAllowedTime(NOW, WINDOW).getTime()).toBe(NOW.getTime());
  });
  it("waits for quiet end, rolling past midnight", () => {
    expect(
      nextAllowedTime(new Date("2026-09-17T23:00:00Z"), WINDOW).toISOString(),
    ).toBe("2026-09-18T07:00:00.000Z");
    expect(
      nextAllowedTime(new Date("2026-09-17T03:00:00Z"), WINDOW).toISOString(),
    ).toBe("2026-09-17T07:00:00.000Z");
  });
  it("resolves the end in the user's zone", () => {
    // 23:30Z = 05:00 IST Sep 18, inside 22-7 IST -> 07:00 IST = 01:30Z.
    expect(
      nextAllowedTime(new Date("2026-09-17T23:30:00Z"), {
        ...WINDOW,
        timeZone: "Asia/Kolkata",
      }).toISOString(),
    ).toBe("2026-09-18T01:30:00.000Z");
  });
});

describe("hourInZone / isExpired", () => {
  it("reads wall hours per zone", () => {
    expect(hourInZone(NOW, "UTC")).toBe(10);
    expect(hourInZone(NOW, "Asia/Kolkata")).toBe(16);
  });
  it("expires reminders older than 7 days", () => {
    expect(
      isExpired(new Date(NOW.getTime() - MAX_OVERDUE_MS - 1), NOW),
    ).toBe(true);
    expect(isExpired(new Date(NOW.getTime() - MAX_OVERDUE_MS), NOW)).toBe(false);
    expect(isExpired(new Date(NOW.getTime() + 1000), NOW)).toBe(false);
  });
});
