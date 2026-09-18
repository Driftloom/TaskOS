import { describe, expect, it } from "vitest";
import { CreateTaskBody, UpdateTaskBody } from "@workspace/api-zod";
import {
  parseNaturalDate,
  resolveDueInput,
  zonedWallToUtc,
} from "./natural-date";

// Fixed reference: 2026-09-17T10:30:00Z is a Thursday.
const NOW = new Date("2026-09-17T10:30:00.000Z");
const iso = (d: Date | null) => d?.toISOString() ?? null;
const at = (text: string, timeZone = "UTC") =>
  iso(parseNaturalDate(text, { now: NOW, timeZone }));

describe("parseNaturalDate — relative words (UTC)", () => {
  it("today defaults to 09:00", () => {
    expect(at("today")).toBe("2026-09-17T09:00:00.000Z");
  });
  it("tomorrow and aliases", () => {
    expect(at("tomorrow")).toBe("2026-09-18T09:00:00.000Z");
    expect(at("tmr")).toBe("2026-09-18T09:00:00.000Z");
    expect(at("tmrw")).toBe("2026-09-18T09:00:00.000Z");
    expect(at("day after tomorrow")).toBe("2026-09-19T09:00:00.000Z");
  });
  it("yesterday is kept (overdue capture is legitimate)", () => {
    expect(at("yesterday")).toBe("2026-09-16T09:00:00.000Z");
  });
  it("late-day words", () => {
    expect(at("tonight")).toBe("2026-09-17T20:00:00.000Z");
    expect(at("eod")).toBe("2026-09-17T18:00:00.000Z");
    expect(at("end of day")).toBe("2026-09-17T18:00:00.000Z");
    expect(at("noon")).toBe("2026-09-17T12:00:00.000Z");
  });
  it("midnight rolls to the next future midnight", () => {
    expect(at("midnight")).toBe("2026-09-18T00:00:00.000Z");
  });
});

describe("parseNaturalDate — weekdays (UTC, now is Thursday)", () => {
  it("bare upcoming weekday", () => {
    expect(at("fri")).toBe("2026-09-18T09:00:00.000Z");
    expect(at("friday")).toBe("2026-09-18T09:00:00.000Z");
  });
  it("bare same-day weekday with passed default time rolls +7d", () => {
    expect(at("thu")).toBe("2026-09-24T09:00:00.000Z");
  });
  it("bare same-day weekday with future time stays today", () => {
    expect(at("thu 3pm")).toBe("2026-09-17T15:00:00.000Z");
  });
  it("next X is one week after the upcoming X", () => {
    expect(at("next fri")).toBe("2026-09-25T09:00:00.000Z");
    expect(at("next thursday")).toBe("2026-09-24T09:00:00.000Z");
  });
});

describe("parseNaturalDate — explicit dates (UTC)", () => {
  it("ISO date", () => {
    expect(at("2026-09-20")).toBe("2026-09-20T09:00:00.000Z");
  });
  it("month-name dates prefer the nearest future year", () => {
    expect(at("sep 20")).toBe("2026-09-20T09:00:00.000Z");
    expect(at("20 sep")).toBe("2026-09-20T09:00:00.000Z");
    expect(at("sep 10")).toBe("2027-09-10T09:00:00.000Z");
    expect(at("sep 20 2026")).toBe("2026-09-20T09:00:00.000Z");
  });
  it("ordinals and commas are tolerated", () => {
    expect(at("Sep 20th, 9am")).toBe("2026-09-20T09:00:00.000Z");
  });
  it("impossible and ambiguous dates are rejected", () => {
    expect(at("feb 30")).toBeNull();
    expect(at("feb 29")).toBeNull(); // 2026 and 2027 both non-leap
    expect(at("2026-13-01")).toBeNull();
    expect(at("09/20")).toBeNull(); // MM/DD refused: US/EU ambiguity
  });
});

describe("parseNaturalDate — times (UTC)", () => {
  it("12h and 24h clocks", () => {
    expect(at("today 5pm")).toBe("2026-09-17T17:00:00.000Z");
    expect(at("5pm today")).toBe("2026-09-17T17:00:00.000Z");
    expect(at("tomorrow 5pm")).toBe("2026-09-18T17:00:00.000Z");
    expect(at("17:30")).toBe("2026-09-17T17:30:00.000Z");
    expect(at("12am")).toBe("2026-09-18T00:00:00.000Z"); // past -> rolls
    expect(at("12pm")).toBe("2026-09-17T12:00:00.000Z");
  });
  it("dateless past times roll to tomorrow; boundary is inclusive", () => {
    expect(at("9am")).toBe("2026-09-18T09:00:00.000Z");
    expect(at("10:30")).toBe("2026-09-18T10:30:00.000Z");
  });
  it("date + time in either order, at/on tolerated", () => {
    expect(at("fri at 5pm")).toBe("2026-09-18T17:00:00.000Z");
    expect(at("5pm on fri")).toBe("2026-09-18T17:00:00.000Z");
  });
  it("relative durations", () => {
    expect(at("in 2 hours")).toBe("2026-09-17T12:30:00.000Z");
    expect(at("in 30 minutes")).toBe("2026-09-17T11:00:00.000Z");
    expect(at("in an hour")).toBe("2026-09-17T11:30:00.000Z");
    expect(at("in 1 day")).toBe("2026-09-18T10:30:00.000Z");
    expect(at("in 2 weeks")).toBe("2026-10-01T10:30:00.000Z");
  });
  it("garbage and ambiguity are rejected, never guessed", () => {
    expect(at("buy milk")).toBeNull();
    expect(at("")).toBeNull();
    expect(at("tomorrow 5pm 6pm")).toBeNull();
    expect(at("mon tue")).toBeNull();
    expect(at("13pm")).toBeNull();
    expect(at("25:00")).toBeNull();
    expect(at("meeting tomorrow")).toBeNull();
  });
});

describe("parseNaturalDate — time zones", () => {
  it("Asia/Kolkata resolves wall time correctly", () => {
    // NOW = 16:00 IST.
    expect(at("today", "Asia/Kolkata")).toBe("2026-09-17T03:30:00.000Z");
    expect(at("tomorrow 5pm", "Asia/Kolkata")).toBe("2026-09-18T11:30:00.000Z");
    expect(at("5pm", "Asia/Kolkata")).toBe("2026-09-17T11:30:00.000Z");
  });
  it("invalid zone falls back to UTC", () => {
    expect(at("today", "Mars/Olympus")).toBe("2026-09-17T09:00:00.000Z");
  });
  it("EDT/EST offsets apply", () => {
    expect(at("jul 4 2026 12pm", "America/New_York")).toBe(
      "2026-07-04T16:00:00.000Z",
    );
    expect(at("jan 4 2026 12pm", "America/New_York")).toBe(
      "2026-01-04T17:00:00.000Z",
    );
  });
  it("spring-forward gap resolves to the post-transition instant", () => {
    // 2026-03-08 02:30 does not exist in New York; expect 03:30 EDT.
    expect(at("mar 8 2026 2:30am", "America/New_York")).toBe(
      "2026-03-08T07:30:00.000Z",
    );
  });
  it("fall-back ambiguity resolves to the first occurrence", () => {
    // 2026-11-01 01:30 happens twice; expect 01:30 EDT (05:30Z).
    expect(at("nov 1 2026 1:30am", "America/New_York")).toBe(
      "2026-11-01T05:30:00.000Z",
    );
  });
});

describe("zonedWallToUtc", () => {
  it("passes UTC through", () => {
    expect(
      zonedWallToUtc({ year: 2026, month: 9, day: 17 }, 9, 0, "UTC").toISOString(),
    ).toBe("2026-09-17T09:00:00.000Z");
  });
});

describe("resolveDueInput precedence", () => {
  it("explicit dueAt passes through", () => {
    const dueAt = new Date("2026-09-20T09:00:00.000Z");
    expect(
      resolveDueInput({ dueAt, dueText: null, now: NOW }),
    ).toEqual({ kind: "set", dueAt });
  });
  it("dueAt and dueText together are an error", () => {
    const r = resolveDueInput({
      dueAt: new Date("2026-09-20T09:00:00.000Z"),
      dueText: "tomorrow",
      now: NOW,
    });
    expect(r.kind).toBe("error");
    if (r.kind === "error") {
      expect(r.error).toMatch("mutually exclusive");
    }
  });
  it("blank text and absent input keep the current value", () => {
    expect(resolveDueInput({ now: NOW })).toEqual({ kind: "keep" });
    expect(resolveDueInput({ dueText: "   ", now: NOW })).toEqual({
      kind: "keep",
    });
  });
  it("unparseable text errors with a stable prefix", () => {
    const r = resolveDueInput({ dueText: "someday-ish", now: NOW });
    expect(r.kind).toBe("error");
    if (r.kind === "error") {
      expect(r.error.startsWith("unparseable_due_text:")).toBe(true);
    }
  });
  it("valid text resolves with the given zone", () => {
    const r = resolveDueInput({
      dueText: "tomorrow 5pm",
      timezone: "Asia/Kolkata",
      now: NOW,
    });
    expect(r).toEqual({ kind: "set", dueAt: new Date("2026-09-18T11:30:00.000Z") });
  });
});

describe("contract — regenerated schemas carry the new fields", () => {
  it("create accepts dueText + timezone", () => {
    const p = CreateTaskBody.safeParse({
      title: "x",
      dueText: "tomorrow 5pm",
      timezone: "Asia/Kolkata",
    });
    expect(p.success).toBe(true);
  });
  it("create rejects overlong dueText at the boundary", () => {
    expect(
      CreateTaskBody.safeParse({ title: "x", dueText: "y".repeat(121) }).success,
    ).toBe(false);
    expect(
      CreateTaskBody.safeParse({ title: "x", dueText: "y".repeat(120) }).success,
    ).toBe(true);
  });
  it("update accepts null dueText (documented no-op)", () => {
    expect(UpdateTaskBody.safeParse({ dueText: null }).success).toBe(true);
  });
});
