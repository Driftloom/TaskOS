process.env.DATABASE_URL ??=
  "postgresql://postgres:postgres@127.0.0.1:1/postgres?connect_timeout=1";

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GetSlippageReportQueryParams, GetSlippageReportResponse } from "@workspace/api-zod";

const ANALYTICS_PATH = join(__dirname, "analytics.ts");
const analyticsSource = readFileSync(ANALYTICS_PATH, "utf8");

const mockReport = {
  windowDays: 7,
  totalSlipped: 2,
  totalCompletedOnTime: 5,
  onTimeRate: 0.83,
  byReason: {
    capacityOverrun: 1,
    missedDeadline: 1,
    postponed: 0,
    flaggedCapExceeded: 0,
  },
  slippedTasks: [
    {
      id: 101,
      title: "Quarterly tax filing",
      rescheduleCount: 3,
      needsAttention: false,
      priority: "high",
      status: "open",
      dueAt: new Date().toISOString(),
      originalDueAt: new Date(Date.now() - 86400000).toISOString(),
      reason: "capacity_overrun" as const,
      reasonLabel: "Capacity Overrun (Multiple Moves)",
      recommendedAction: "Allocate a dedicated 45m calendar focus block",
    },
  ],
  reconciliation: {
    rawProposalsCount: 1,
    autoMovedTasksCount: 1,
    flaggedTasksCount: 0,
    openOverdueCount: 1,
    agentRescheduledCount: 0,
  },
};

/**
 * The rate helper is imported from the route module itself, so the test
 * exercises the exact function the endpoint calls rather than a copy of it.
 * The import is dynamic because `lib/db` refuses to load without a
 * DATABASE_URL, and the assignment above only runs after static imports
 * are evaluated.
 */
type OnTimeRateFn = (completedOnTime: number, completedInWindow: number) => number | null;

let computeOnTimeRate: OnTimeRateFn;

beforeAll(async () => {
  process.env.DATABASE_URL ??=
    "postgresql://postgres:postgres@127.0.0.1:1/postgres?connect_timeout=1";
  const analyticsModule = await import("./analytics");
  computeOnTimeRate = analyticsModule.computeOnTimeRate;
});

describe("Analytics & Slippage Reconciliation contracts", () => {
  it("GET /api/analytics/slippage query schema parses days and defaults to 7", () => {
    const defaultParsed = GetSlippageReportQueryParams.parse({});
    expect(defaultParsed.days).toBe(7);

    const customParsed = GetSlippageReportQueryParams.parse({ days: "14", timezone: "Asia/Kolkata" });
    expect(customParsed.days).toBe(14);
    expect(customParsed.timezone).toBe("Asia/Kolkata");
  });

  it("SlippageReport response schema validates complete report structure", () => {
    const validated = GetSlippageReportResponse.parse(mockReport);
    expect(validated.totalSlipped).toBe(2);
    expect(validated.onTimeRate).toBe(0.83);
    expect(validated.slippedTasks[0].reason).toBe("capacity_overrun");
  });

  it("analytics router enforces requireAuth and runWithRls", () => {
    expect(analyticsSource).toContain('router.get("/analytics/slippage", requireAuth');
    expect(analyticsSource).toContain("runWithRls(req, async (tx) =>");
    expect(analyticsSource).toContain("tasksTable.userId, req.userId!");
    expect(analyticsSource).toContain("rescheduleProposalsTable.userId, req.userId!");
    expect(analyticsSource).toContain("agentActionLogTable.userId, req.userId!");
  });

  it("router is registered in api-server routes index", () => {
    const indexPath = join(__dirname, "index.ts");
    const indexSource = readFileSync(indexPath, "utf8");
    expect(indexSource).toContain('import analyticsRouter from "./analytics";');
    expect(indexSource).toContain("router.use(analyticsRouter);");
  });
});

describe("slippage on-time rate", () => {
  it("reports no rate at all when the window contains no completed tasks", () => {
    // An empty window is not a perfect day. It is an empty sample, and the
    // only honest answer is "no rate yet" (null), never 100%.
    expect(computeOnTimeRate(0, 0)).toBeNull();
  });

  it("computes the real rate when the window contains completed tasks", () => {
    expect(computeOnTimeRate(3, 4)).toBe(0.75);
    expect(computeOnTimeRate(2, 2)).toBe(1);
    expect(computeOnTimeRate(0, 2)).toBe(0);
  });

  it("route computes the rate through the null-returning helper", () => {
    expect(analyticsSource).toContain("computeOnTimeRate(completedOnTime, completedInWindow)");
    // The old fallback was a literal 1.0 for an empty window.
    expect(analyticsSource).not.toMatch(/onTimeRate[\s\S]{0,160}:\s*1\.0\b/);
  });

  it("response contract permits a null on-time rate", () => {
    const emptyWindow = {
      ...mockReport,
      totalCompletedOnTime: 0,
      onTimeRate: null,
    };
    const validated = GetSlippageReportResponse.parse(emptyWindow);
    expect(validated.onTimeRate).toBeNull();
  });
});
