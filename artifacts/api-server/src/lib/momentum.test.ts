import { describe, expect, it } from "vitest";
import { GetFocusSettingsResponse, GetMomentumResponse } from "@workspace/api-zod";
import { computeStreak, dayKeyInZone } from "./momentum";

describe("dayKeyInZone", () => {
  it("reads the calendar day per zone", () => {
    const at = new Date("2026-09-17T23:30:00.000Z");
    expect(dayKeyInZone(at, "UTC")).toBe("2026-09-17");
    expect(dayKeyInZone(at, "Asia/Kolkata")).toBe("2026-09-18");
  });
});

describe("computeStreak", () => {
  it("counts consecutive days ending today", () => {
    expect(
      computeStreak(
        new Set(["2026-09-15", "2026-09-16", "2026-09-17"]),
        "2026-09-17",
      ),
    ).toBe(3);
  });
  it("survives an unplayed today via yesterday", () => {
    expect(
      computeStreak(new Set(["2026-09-15", "2026-09-16"]), "2026-09-17"),
    ).toBe(2);
  });
  it("dies after a missed full day", () => {
    expect(computeStreak(new Set(["2026-09-15"]), "2026-09-17")).toBe(0);
    expect(computeStreak(new Set(), "2026-09-17")).toBe(0);
  });
  it("breaks on gaps and spans month boundaries", () => {
    expect(
      computeStreak(
        new Set(["2026-08-31", "2026-09-01", "2026-09-02", "2026-09-04"]),
        "2026-09-04",
      ),
    ).toBe(1);
    expect(
      computeStreak(new Set(["2026-08-31", "2026-09-01", "2026-09-02"]), "2026-09-02"),
    ).toBe(3);
  });
});

describe("contract — focus settings and momentum shapes", () => {
  it("settings default shape", () => {
    expect(
      GetFocusSettingsResponse.safeParse({
        dailyTarget: 4,
        createdAt: "2026-09-17T10:00:00.000Z",
        updatedAt: "2026-09-17T10:00:00.000Z",
      }).success,
    ).toBe(true);
  });
  it("momentum shape", () => {
    expect(
      GetMomentumResponse.safeParse({
        date: "2026-09-17",
        tasksTotal: 3,
        tasksCompleted: 1,
        roundsCompleted: 2,
        roundTarget: 4,
        streakDays: 5,
      }).success,
    ).toBe(true);
  });
});
