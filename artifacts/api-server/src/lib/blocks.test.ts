import { describe, expect, it } from "vitest";
import { CreateTaskBlockBody, ListBlocksQueryParams } from "@workspace/api-zod";
import { findOverlap, rangesOverlap } from "./blocks";

const r = (s: string, e: string) => ({
  startAt: new Date(s),
  endAt: new Date(e),
});

describe("rangesOverlap", () => {
  it("detects partial and full overlaps", () => {
    expect(
      rangesOverlap(r("2026-09-20T09:00Z", "2026-09-20T10:00Z"), r("2026-09-20T09:30Z", "2026-09-20T11:00Z")),
    ).toBe(true);
    expect(
      rangesOverlap(r("2026-09-20T09:00Z", "2026-09-20T12:00Z"), r("2026-09-20T10:00Z", "2026-09-20T11:00Z")),
    ).toBe(true);
    expect(
      rangesOverlap(r("2026-09-20T09:00Z", "2026-09-20T10:00Z"), r("2026-09-20T09:00Z", "2026-09-20T10:00Z")),
    ).toBe(true);
  });
  it("allows adjacent and disjoint blocks", () => {
    expect(
      rangesOverlap(r("2026-09-20T09:00Z", "2026-09-20T10:00Z"), r("2026-09-20T10:00Z", "2026-09-20T11:00Z")),
    ).toBe(false);
    expect(
      rangesOverlap(r("2026-09-20T09:00Z", "2026-09-20T10:00Z"), r("2026-09-20T11:00Z", "2026-09-20T12:00Z")),
    ).toBe(false);
  });
});

describe("findOverlap", () => {
  it("returns the first colliding block or null", () => {
    const existing = [
      r("2026-09-20T09:00Z", "2026-09-20T10:00Z"),
      r("2026-09-20T14:00Z", "2026-09-20T15:00Z"),
    ];
    expect(findOverlap(r("2026-09-20T14:30Z", "2026-09-20T16:00Z"), existing)).toBe(
      existing[1],
    );
    expect(findOverlap(r("2026-09-20T10:00Z", "2026-09-20T14:00Z"), existing)).toBeNull();
  });
});

describe("contract — block shapes", () => {
  it("requires both ends", () => {
    expect(
      CreateTaskBlockBody.safeParse({
        startAt: "2026-09-20T09:00:00.000Z",
        endAt: "2026-09-20T10:00:00.000Z",
      }).success,
    ).toBe(true);
    expect(CreateTaskBlockBody.safeParse({}).success).toBe(false);
  });
  it("range queries accept an optional end date", () => {
    expect(
      ListBlocksQueryParams.safeParse({ date: "2026-09-20", endDate: "2026-09-26" }).success,
    ).toBe(true);
    expect(ListBlocksQueryParams.safeParse({ date: "20-09-2026" }).success).toBe(false);
  });
});
