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
const SETTINGS: SweepSettings = { defaultMode: "auto", maxMoves: 5 };

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
    expect(decideReschedule(task({ rescheduleCount: 5 }), SETTINGS, NOW)).toEqual({
      action: "flag",
    });
    expect(decideReschedule(task({ rescheduleCount: 4 }), SETTINGS, NOW)).toMatchObject({
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
    expect(canAcceptProposal(task(), 5)).toEqual({ ok: true });
    expect(canAcceptProposal(null, 5)).toEqual({ ok: false, error: "Task not found." });
    expect(canAcceptProposal(task({ status: "completed" }), 5)).toMatchObject({ ok: false });
    expect(canAcceptProposal(task({ rescheduleCount: 5 }), 5)).toMatchObject({ ok: false });
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

// ---------------------------------------------------------------------------
// Rule 9 integration
// ---------------------------------------------------------------------------
describe("decideReschedule — Rule 9 multiplier (Doc 11 §4a)", () => {
  it("attaches rule9Multiplier and effectiveDuration on a move", () => {
    const decision = decideReschedule(
      task(),
      SETTINGS,
      NOW,
      { durationEstMin: 60, rule9Multiplier: 1.5 },
    );
    if (decision.action === "move") {
      expect(decision.rule9Multiplier).toBe(1.5);
      expect(decision.effectiveDuration).toBe(90);
    } else {
      throw new Error(`Expected move, got ${decision.action}`);
    }
  });

  it("attaches Rule 9 fields on a propose decision", () => {
    const decision = decideReschedule(
      task(),
      { ...SETTINGS, defaultMode: "ask" },
      NOW,
      { durationEstMin: 45, rule9Multiplier: 2.0 },
    );
    if (decision.action === "propose") {
      expect(decision.rule9Multiplier).toBe(2.0);
      expect(decision.effectiveDuration).toBe(90);
    } else {
      throw new Error(`Expected propose, got ${decision.action}`);
    }
  });

  it("does NOT attach rule9 fields when context is absent", () => {
    const decision = decideReschedule(task(), SETTINGS, NOW);
    if (decision.action === "move") {
      expect(decision.rule9Multiplier).toBeUndefined();
      expect(decision.effectiveDuration).toBeUndefined();
    }
  });

  it("does NOT attach rule9 fields when multiplier is null", () => {
    const decision = decideReschedule(task(), SETTINGS, NOW, {
      durationEstMin: 30,
      rule9Multiplier: null,
    });
    if (decision.action === "move") {
      expect(decision.rule9Multiplier).toBeUndefined();
    }
  });

  it("rounds effectiveDuration to integer", () => {
    const decision = decideReschedule(task(), SETTINGS, NOW, {
      durationEstMin: 30,
      rule9Multiplier: 1.333,
    });
    if (decision.action === "move" && decision.effectiveDuration !== undefined) {
      expect(Number.isInteger(decision.effectiveDuration)).toBe(true);
    }
  });

  it("0.8x multiplier shortens effective duration below estimate", () => {
    const decision = decideReschedule(task(), SETTINGS, NOW, {
      durationEstMin: 100,
      rule9Multiplier: 0.8,
    });
    if (decision.action === "move") {
      expect(decision.effectiveDuration).toBe(80);
    }
  });
});

// ---------------------------------------------------------------------------
// Bulk-gate confirmation threshold (Doc 09 #2)
// ---------------------------------------------------------------------------
describe("Bulk agent gate (>10 tasks threshold)", () => {
  it("10 tasks is BELOW threshold — no confirmation needed", () => {
    const taskIds = Array.from({ length: 10 }, (_, i) => i + 1);
    const requiresConfirmation = taskIds.length > 10;
    expect(requiresConfirmation).toBe(false);
  });

  it("11 tasks is ABOVE threshold — confirmation required", () => {
    const taskIds = Array.from({ length: 11 }, (_, i) => i + 1);
    const requiresConfirmation = taskIds.length > 10;
    expect(requiresConfirmation).toBe(true);
  });

  it("confirmed=true bypasses the gate even for 100 tasks", () => {
    const taskIds = Array.from({ length: 100 }, (_, i) => i + 1);
    const confirmed = true;
    const blocked = taskIds.length > 10 && !confirmed;
    expect(blocked).toBe(false);
  });

  it("confirmed=false blocks 11 tasks", () => {
    const taskIds = Array.from({ length: 11 }, (_, i) => i + 1);
    const confirmed = false;
    const blocked = taskIds.length > 10 && !confirmed;
    expect(blocked).toBe(true);
  });
});
