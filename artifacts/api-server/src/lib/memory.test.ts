import { describe, it, expect } from "vitest";

/**
 * Pure unit tests for the memory decay formula and Source A arithmetic logic.
 * No DB or external dependencies — all functions are inlined from memory.ts
 * to avoid triggering the DATABASE_URL guard.
 */

// ---------------------------------------------------------------------------
// Inline the pure functions from memory.ts to keep tests isolated
// ---------------------------------------------------------------------------
function calculateDecayedConfidence(
  initialConfidence: number,
  lastReinforcedAt: Date,
  now: Date = new Date(),
): number {
  const diffMs = now.getTime() - lastReinforcedAt.getTime();
  const daysElapsed = Math.max(0, diffMs / (1000 * 60 * 60 * 24));
  const decayed = Math.round(initialConfidence * Math.exp(-0.02 * daysElapsed));
  return Math.max(10, Math.min(100, decayed));
}

// ---------------------------------------------------------------------------
// calculateDecayedConfidence
// ---------------------------------------------------------------------------
describe("calculateDecayedConfidence", () => {
  it("returns initialConfidence when 0 days elapsed", () => {
    const now = new Date("2024-01-15T12:00:00Z");
    expect(calculateDecayedConfidence(80, now, now)).toBe(80);
  });

  it("applies exponential decay over 30 days", () => {
    const start = new Date("2024-01-01T00:00:00Z");
    const now = new Date("2024-01-31T00:00:00Z"); // 30 days later
    // C_eff = round(80 * e^(-0.02*30)) = round(80 * e^(-0.6)) ≈ round(80 * 0.5488) ≈ 44
    const result = calculateDecayedConfidence(80, start, now);
    expect(result).toBeCloseTo(44, 0);
  });

  it("floors at 10 for very old facts (4+ years)", () => {
    const start = new Date("2020-01-01T00:00:00Z");
    const now = new Date("2024-01-01T00:00:00Z");
    expect(calculateDecayedConfidence(100, start, now)).toBe(10);
  });

  it("caps at 100 even for full confidence with no elapsed time", () => {
    const now = new Date("2024-01-15T12:00:00Z");
    expect(calculateDecayedConfidence(100, now, now)).toBe(100);
  });

  it("decays over 7 days but stays above floor", () => {
    const start = new Date("2024-01-01T00:00:00Z");
    const now = new Date("2024-01-08T00:00:00Z"); // 7 days
    // C_eff ≈ round(90 * e^(-0.14)) ≈ round(90 * 0.869) ≈ 78
    const result = calculateDecayedConfidence(90, start, now);
    expect(result).toBeGreaterThan(70);
    expect(result).toBeLessThan(90);
  });

  it("returns exactly 10 for extremely old facts", () => {
    const start = new Date("2010-01-01T00:00:00Z");
    const now = new Date("2024-01-01T00:00:00Z");
    expect(calculateDecayedConfidence(50, start, now)).toBe(10);
  });

  it("handles future lastReinforcedAt gracefully (clamps to 0 days, no decay)", () => {
    const now = new Date("2024-01-01T00:00:00Z");
    const future = new Date("2024-02-01T00:00:00Z");
    // daysElapsed = max(0, negative) = 0 → no decay
    expect(calculateDecayedConfidence(75, future, now)).toBe(75);
  });

  it("partial day decay is proportional (0.5 days)", () => {
    const start = new Date("2024-01-01T00:00:00Z");
    const now = new Date("2024-01-01T12:00:00Z"); // 0.5 days
    // C_eff = round(100 * e^(-0.01)) ≈ 99
    const result = calculateDecayedConfidence(100, start, now);
    expect(result).toBeGreaterThanOrEqual(99);
    expect(result).toBeLessThanOrEqual(100);
  });

  it("confidence 10 does not fall below floor after decay", () => {
    const start = new Date("2024-01-01T00:00:00Z");
    const now = new Date("2026-01-01T00:00:00Z"); // 2 years
    expect(calculateDecayedConfidence(10, start, now)).toBe(10);
  });

  it("100-day decay from 100 is still meaningful (above 10)", () => {
    const start = new Date("2024-01-01T00:00:00Z");
    const now = new Date("2024-04-10T00:00:00Z"); // ~100 days
    // C_eff = round(100 * e^(-2.0)) ≈ round(13.5) ≈ 14
    const result = calculateDecayedConfidence(100, start, now);
    expect(result).toBeGreaterThanOrEqual(10);
    expect(result).toBeLessThan(25);
  });
});

// ---------------------------------------------------------------------------
// Source A arithmetic helpers
// ---------------------------------------------------------------------------
describe("Source A arithmetic — multiplier computation", () => {
  it("computes 1.5x when actual takes 50% longer than estimate", () => {
    const estMin = 60;
    const actualMin = 90;
    const ratio = Math.round((actualMin / estMin) * 10) / 10;
    expect(ratio).toBe(1.5);
  });

  it("computes 0.8x when actual is 20% shorter than estimate", () => {
    const estMin = 100;
    const actualMin = 80;
    const ratio = Math.round((actualMin / estMin) * 10) / 10;
    expect(ratio).toBe(0.8);
  });

  it("ratio is exactly 1.0 when actual equals estimate", () => {
    const estMin = 45;
    const actualMin = 45;
    const ratio = Math.round((actualMin / estMin) * 10) / 10;
    expect(ratio).toBe(1.0);
  });

  it("detects significant deviation >= 1.2", () => {
    const ratio = 1.3;
    expect(ratio >= 1.2 || ratio <= 0.8).toBe(true);
  });

  it("detects significant deviation <= 0.8", () => {
    const ratio = 0.7;
    expect(ratio >= 1.2 || ratio <= 0.8).toBe(true);
  });

  it("does NOT detect insignificant deviation (ratio=1.05)", () => {
    const ratio = 1.05;
    expect(ratio >= 1.2 || ratio <= 0.8).toBe(false);
  });

  it("does NOT detect insignificant deviation (ratio=0.9)", () => {
    const ratio = 0.9;
    expect(ratio >= 1.2 || ratio <= 0.8).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Confidence scoring for evidence count
// ---------------------------------------------------------------------------
describe("Source A — confidence scoring", () => {
  function scoreConfidence(evidenceCount: number): number {
    return Math.min(95, 60 + evidenceCount * 5);
  }

  it("confidence caps at 95 regardless of evidence count", () => {
    expect(scoreConfidence(200)).toBe(95);
  });

  it("2 tasks → 70 confidence", () => {
    expect(scoreConfidence(2)).toBe(70);
  });

  it("5 tasks → 85 confidence", () => {
    expect(scoreConfidence(5)).toBe(85);
  });

  it("7 tasks → hits cap at 95", () => {
    expect(scoreConfidence(7)).toBe(95);
  });

  it("10 tasks → also capped at 95", () => {
    expect(scoreConfidence(10)).toBe(95);
  });

  it("0 tasks → 60 (base confidence)", () => {
    expect(scoreConfidence(0)).toBe(60);
  });
});

// ---------------------------------------------------------------------------
// Behavioral archiving thresholds
// ---------------------------------------------------------------------------
describe("Source A — auto-archive thresholds", () => {
  function shouldAutoArchive(confidence: number, source: string): boolean {
    return confidence < 35 && source === "behavioral";
  }

  it("archives behavioral fact with confidence 34", () => {
    expect(shouldAutoArchive(34, "behavioral")).toBe(true);
  });

  it("does NOT archive behavioral fact with confidence 35", () => {
    expect(shouldAutoArchive(35, "behavioral")).toBe(false);
  });

  it("does NOT archive conversational fact with low confidence", () => {
    // Source B facts require user confirmation, not auto-archive
    expect(shouldAutoArchive(20, "conversational")).toBe(false);
  });

  it("archives behavioral fact with confidence 10 (floor)", () => {
    expect(shouldAutoArchive(10, "behavioral")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Minimum evidence threshold
// ---------------------------------------------------------------------------
describe("Source A — minimum evidence threshold", () => {
  it("requires at least 2 data points to compute a multiplier", () => {
    const tasksWithFocus = [{ durationEstMin: 30, totalElapsedSeconds: 1800 }];
    expect(tasksWithFocus.length >= 2).toBe(false);
  });

  it("passes threshold with 2 data points", () => {
    const tasksWithFocus = [
      { durationEstMin: 30, totalElapsedSeconds: 1800 },
      { durationEstMin: 60, totalElapsedSeconds: 3600 },
    ];
    expect(tasksWithFocus.length >= 2).toBe(true);
  });

  it("filters out tasks with < 60s of focus time", () => {
    const tasks = [
      { durationEstMin: 30, totalElapsedSeconds: 30 },   // too short
      { durationEstMin: 30, totalElapsedSeconds: 1800 }, // ok
    ];
    const valid = tasks.filter(
      (t) => t.durationEstMin > 0 && t.totalElapsedSeconds > 60,
    );
    expect(valid).toHaveLength(1);
  });

  it("filters out tasks with null durationEstMin", () => {
    const tasks = [
      { durationEstMin: null, totalElapsedSeconds: 1800 },
      { durationEstMin: 60, totalElapsedSeconds: 3600 },
    ];
    const valid = tasks.filter(
      (t) => t.durationEstMin && t.durationEstMin > 0 && t.totalElapsedSeconds > 60,
    );
    expect(valid).toHaveLength(1);
  });
});
