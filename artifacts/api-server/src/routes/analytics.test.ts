process.env.DATABASE_URL ??=
  "postgresql://postgres:postgres@127.0.0.1:1/postgres?connect_timeout=1";

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GetSlippageReportQueryParams, GetSlippageReportResponse } from "@workspace/api-zod";

const ANALYTICS_PATH = join(__dirname, "analytics.ts");
const analyticsSource = readFileSync(ANALYTICS_PATH, "utf8");

describe("Analytics & Slippage Reconciliation contracts", () => {
  it("GET /api/analytics/slippage query schema parses days and defaults to 7", () => {
    const defaultParsed = GetSlippageReportQueryParams.parse({});
    expect(defaultParsed.days).toBe(7);

    const customParsed = GetSlippageReportQueryParams.parse({ days: "14", timezone: "Asia/Kolkata" });
    expect(customParsed.days).toBe(14);
    expect(customParsed.timezone).toBe("Asia/Kolkata");
  });

  it("SlippageReport response schema validates complete report structure", () => {
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
