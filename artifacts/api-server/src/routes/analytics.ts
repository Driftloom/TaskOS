import { and, desc, eq, gte, lt, or } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  tasksTable,
  rescheduleProposalsTable,
  agentActionLogTable,
} from "@workspace/db";
import {
  GetSlippageReportQueryParams,
  GetSlippageReportResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { runWithRls } from "../lib/rls";
import { computeOnTimeRate } from "../lib/slippage";

const router: IRouter = Router();

/**
 * GET /api/analytics/slippage
 * "What Slipped & Why" raw-table reconciliation report:
 * Compares tasks, reschedule_proposals, and agent_action_log
 * across the specified lookback window (default 7 days).
 */
router.get("/analytics/slippage", requireAuth, async (req, res): Promise<void> => {
  const parsed = GetSlippageReportQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const days = parsed.data.days ?? 7;
  const now = new Date();
  const windowStart = new Date(now.getTime() - days * 86_400_000);

  const report = await runWithRls(req, async (tx) => {
    // 1. Fetch relevant tasks in or bordering the window
    const userTasks = await tx
      .select()
      .from(tasksTable)
      .where(
        and(
          eq(tasksTable.userId, req.userId!),
          or(
            gte(tasksTable.dueAt, windowStart),
            gte(tasksTable.completedAt, windowStart),
            eq(tasksTable.status, "open"),
            eq(tasksTable.needsAttention, true),
            gte(tasksTable.rescheduleCount, 1),
          ),
        ),
      )
      .orderBy(desc(tasksTable.updatedAt));

    // 2. Fetch raw proposals in the window
    const proposals = await tx
      .select()
      .from(rescheduleProposalsTable)
      .where(
        and(
          eq(rescheduleProposalsTable.userId, req.userId!),
          gte(rescheduleProposalsTable.createdAt, windowStart),
        ),
      )
      .orderBy(desc(rescheduleProposalsTable.createdAt));

    // 3. Fetch agent action log mutations in the window
    const agentActions = await tx
      .select()
      .from(agentActionLogTable)
      .where(
        and(
          eq(agentActionLogTable.userId, req.userId!),
          gte(agentActionLogTable.createdAt, windowStart),
        ),
      )
      .orderBy(desc(agentActionLogTable.createdAt));

    // Map proposals and agent actions by taskId
    const proposalMap = new Map<number, typeof proposals>();
    for (const p of proposals) {
      const list = proposalMap.get(p.taskId) ?? [];
      list.push(p);
      proposalMap.set(p.taskId, list);
    }

    const agentRescheduleActions = agentActions.filter(
      (a) =>
        a.action === "reschedule_task" ||
        a.action === "bulk_reschedule" ||
        (a.targetType === "task" &&
          a.beforeState &&
          typeof a.beforeState === "object" &&
          "dueAt" in (a.beforeState as Record<string, unknown>)),
    );

    const agentActionMap = new Map<number, typeof agentActions>();
    for (const a of agentRescheduleActions) {
      if (a.targetId) {
        const list = agentActionMap.get(a.targetId) ?? [];
        list.push(a);
        agentActionMap.set(a.targetId, list);
      }
    }

    // Classify tasks and calculate on-time rate
    let completedInWindow = 0;
    let completedOnTime = 0;

    interface SlippedTaskItem {
      id: number;
      title: string;
      rescheduleCount: number;
      needsAttention: boolean;
      priority: string;
      status: string;
      dueAt: string | null;
      originalDueAt: string | null;
      reason: "capacity_overrun" | "missed_deadline" | "postponed" | "flagged_cap_exceeded";
      reasonLabel: string;
      recommendedAction: string;
    }

    const slippedTasks: SlippedTaskItem[] = [];

    for (const task of userTasks) {
      const dueTime = task.dueAt ? new Date(task.dueAt).getTime() : null;
      const completedTime = task.completedAt ? new Date(task.completedAt).getTime() : null;

      if (completedTime && completedTime >= windowStart.getTime()) {
        completedInWindow++;
        if (!dueTime || completedTime <= dueTime + 60_000) {
          completedOnTime++;
        }
      }

      const taskProposals = proposalMap.get(task.id) ?? [];
      const taskActions = agentActionMap.get(task.id) ?? [];
      const hasPendingProposal = taskProposals.some((p) => p.status === "pending");
      const hasAcceptedProposal = taskProposals.some((p) => p.status === "accepted");
      const isOverdue = task.status === "open" && dueTime !== null && dueTime < now.getTime();
      const completedLate =
        task.status === "completed" &&
        completedTime !== null &&
        dueTime !== null &&
        completedTime > dueTime + 60_000;

      const isSlipped =
        task.needsAttention ||
        task.rescheduleCount > 0 ||
        isOverdue ||
        completedLate ||
        hasPendingProposal ||
        hasAcceptedProposal ||
        taskActions.length > 0;

      if (!isSlipped) continue;

      let originalDueAt: string | null = null;
      if (taskProposals.length > 0 && taskProposals[taskProposals.length - 1].fromDue) {
        originalDueAt = taskProposals[taskProposals.length - 1].fromDue!.toISOString();
      } else if (taskActions.length > 0) {
        const bState = taskActions[0].beforeState as Record<string, unknown> | null;
        if (bState && typeof bState.dueAt === "string") {
          originalDueAt = bState.dueAt;
        }
      }

      let reason: "capacity_overrun" | "missed_deadline" | "postponed" | "flagged_cap_exceeded";
      let reasonLabel: string;
      let recommendedAction: string;

      if (task.needsAttention || task.rescheduleCount >= 5) {
        reason = "flagged_cap_exceeded";
        reasonLabel = "Exceeded Auto-Reschedule Cap";
        recommendedAction = "Break down into subtasks or decide whether to archive";
      } else if (task.rescheduleCount >= 2) {
        reason = "capacity_overrun";
        reasonLabel = "Capacity Overrun (Multiple Moves)";
        recommendedAction = "Allocate a dedicated 45m calendar focus block";
      } else if (hasPendingProposal) {
        reason = "postponed";
        reasonLabel = "Awaiting Reschedule Decision";
        recommendedAction = "Review and accept or decline proposal";
      } else if (hasAcceptedProposal || taskActions.length > 0) {
        reason = "postponed";
        reasonLabel = "Rescheduled on Request";
        recommendedAction = "Track towards newly agreed calendar slot";
      } else if (isOverdue || completedLate) {
        reason = "missed_deadline";
        reasonLabel = "Missed Deadline";
        recommendedAction = "Reschedule to today or close if no longer needed";
      } else {
        reason = "postponed";
        reasonLabel = "Schedule Adjustment";
        recommendedAction = "Confirm target date in review";
      }

      slippedTasks.push({
        id: task.id,
        title: task.title,
        rescheduleCount: task.rescheduleCount,
        needsAttention: task.needsAttention,
        priority: task.priority,
        status: task.status,
        dueAt: task.dueAt ? task.dueAt.toISOString() : null,
        originalDueAt,
        reason,
        reasonLabel,
        recommendedAction,
      });
    }

    const onTimeRate = computeOnTimeRate(completedOnTime, completedInWindow);

    const byReason = {
      capacityOverrun: slippedTasks.filter((t) => t.reason === "capacity_overrun").length,
      missedDeadline: slippedTasks.filter((t) => t.reason === "missed_deadline").length,
      postponed: slippedTasks.filter((t) => t.reason === "postponed").length,
      flaggedCapExceeded: slippedTasks.filter((t) => t.reason === "flagged_cap_exceeded").length,
    };

    const reconciliation = {
      rawProposalsCount: proposals.length,
      autoMovedTasksCount: userTasks.filter((t) => t.rescheduleCount > 0).length,
      flaggedTasksCount: userTasks.filter((t) => t.needsAttention).length,
      openOverdueCount: userTasks.filter(
        (t) => t.status === "open" && t.dueAt && new Date(t.dueAt).getTime() < now.getTime(),
      ).length,
      agentRescheduledCount: agentRescheduleActions.length,
    };

    return {
      windowDays: days,
      totalSlipped: slippedTasks.length,
      totalCompletedOnTime: completedOnTime,
      onTimeRate,
      byReason,
      slippedTasks,
      reconciliation,
    };
  });

  res.json(GetSlippageReportResponse.parse(report));
});

export default router;
