import { describe, expect, it } from "vitest";
import {
  AcceptRescheduleProposalResponse,
  GetRescheduleSettingsResponse,
  UpdateRescheduleSettingsBody,
} from "@workspace/api-zod";
import {
  canAcceptProposal,
  decideReschedule,
  isOverdue,
  nextDueAt,
  type SweepSettings,
  type SweepTask,
} from "./reschedule";

const NOW = new Date("2026-09-18T10:00:00.000Z");
const SETTINGS: SweepSettings = { defaultMode: "auto", maxMoves: 3 };

function task(overrides: Partial<SweepTask> = {}): SweepTask {
  return {
    id: 1,
    status: "open",
    dueAt: new Date("2026-09-17T10:00:00.000Z"),
    rescheduleCount: 0,
    needsAttention: false,
    automation: null,
    ...overrides,
  };
}

describe("isOverdue", () => {
  it("sweeps open and inbox tasks with past due dates", () => {
    expect(isOverdue(task(), NOW)).toBe(true);
    expect(isOverdue(task({ status: "inbox" }), NOW)).toBe(true);
  });
  it("never sweeps completed, future, or dateless tasks", () => {
    expect(isOverdue(task({ status: "completed" }), NOW)).toBe(false);
    expect(
      isOverdue(task({ dueAt: new Date("2026-09-19T10:00:00Z") }), NOW),
    ).toBe(false);
    expect(isOverdue(task({ dueAt: null }), NOW)).toBe(false);
  });
});

describe("decideReschedule mode matrix", () => {
  it("auto moves +24h", () => {
    const d = decideReschedule(task(), SETTINGS, NOW);
    expect(d).toEqual({
      action: "move",
      toDueAt: new Date("2026-09-18T10:00:00.000Z"),
    });
  });
  it("ask proposes, off flags", () => {
    expect(decideReschedule(task(), { ...SETTINGS, defaultMode: "ask" }, NOW)).toEqual({
      action: "propose",
      toDueAt: new Date("2026-09-18T10:00:00.000Z"),
    });
    expect(decideReschedule(task(), { ...SETTINGS, defaultMode: "off" }, NOW)).toEqual({
      action: "flag",
    });
  });
  it("per-task automation overrides the default", () => {
    expect(
      decideReschedule(task({ automation: "off" }), SETTINGS, NOW),
    ).toEqual({ action: "flag" });
    expect(
      decideReschedule(task({ automation: "ask" }), SETTINGS, NOW),
    ).toMatchObject({ action: "propose" });
  });
  it("cap reached flags even in auto mode", () => {
    expect(decideReschedule(task({ rescheduleCount: 3 }), SETTINGS, NOW)).toEqual({
      action: "flag",
    });
    expect(decideReschedule(task({ rescheduleCount: 2 }), SETTINGS, NOW)).toMatchObject({
      action: "move",
    });
  });
  it("custom caps are honored", () => {
    const custom = { defaultMode: "auto" as const, maxMoves: 1 };
    expect(decideReschedule(task({ rescheduleCount: 1 }), custom, NOW)).toEqual({
      action: "flag",
    });
  });
  it("flagged and fresh tasks are skipped, never re-churned", () => {
    expect(
      decideReschedule(task({ needsAttention: true }), SETTINGS, NOW),
    ).toEqual({ action: "skip" });
    expect(
      decideReschedule(
        task({ dueAt: new Date("2026-09-19T10:00:00Z") }),
        SETTINGS,
        NOW,
      ),
    ).toEqual({ action: "skip" });
  });
});

describe("nextDueAt", () => {
  it("shifts exactly +24h", () => {
    expect(nextDueAt(new Date("2026-09-17T10:00:00.000Z"))).toEqual(
      new Date("2026-09-18T10:00:00.000Z"),
    );
  });
});

describe("canAcceptProposal", () => {
  it("accepts open under-cap tasks, rejects the rest", () => {
    expect(canAcceptProposal(task(), 3)).toEqual({ ok: true });
    expect(canAcceptProposal(null, 3)).toEqual({ ok: false, error: "Task not found." });
    expect(canAcceptProposal(task({ status: "completed" }), 3)).toMatchObject({ ok: false });
    expect(canAcceptProposal(task({ rescheduleCount: 3 }), 3)).toMatchObject({ ok: false });
  });
});

describe("contract — reschedule shapes", () => {
  it("settings boundaries", () => {
    expect(
      UpdateRescheduleSettingsBody.safeParse({ defaultMode: "auto", maxMoves: 5 }).success,
    ).toBe(true);
    expect(
      UpdateRescheduleSettingsBody.safeParse({ defaultMode: "sometimes" }).success,
    ).toBe(false);
    expect(UpdateRescheduleSettingsBody.safeParse({ maxMoves: 11 }).success).toBe(false);
    expect(
      GetRescheduleSettingsResponse.safeParse({
        defaultMode: "ask",
        maxMoves: 3,
        createdAt: "2026-09-18T10:00:00.000Z",
        updatedAt: "2026-09-18T10:00:00.000Z",
      }).success,
    ).toBe(true);
  });
  it("proposal response shape", () => {
    expect(
      AcceptRescheduleProposalResponse.safeParse({
        id: 1,
        taskId: 2,
        fromDue: null,
        toDue: "2026-09-19T10:00:00.000Z",
        status: "accepted",
        createdAt: "2026-09-18T10:00:00.000Z",
        updatedAt: "2026-09-18T10:00:00.000Z",
      }).success,
    ).toBe(true);
  });
});
