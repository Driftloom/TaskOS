import { and, desc, eq, gte, inArray, isNotNull, lt, lte, sql } from "drizzle-orm";
import {
  focusSessionsTable,
  monthlyGoalsTable,
  monthlyGoalSnapshotsTable,
  notificationSettingsTable,
  projectsTable,
  tagsTable,
  tasksTable,
  taskTagsTable,
  type MonthlyGoal,
} from "@workspace/db";
import { type MonthWindow, localDateInZone } from "./month-window";

export type GoalMetric =
  | "focus_minutes"
  | "focus_sessions"
  | "focus_days"
  | "tasks_completed"
  | "tasks_completed_on_time";

export type GoalScopeKind = "global" | "project" | "tag";

export interface GoalActualResult {
  actual: number;
  scopeDeleted: boolean;
  scopeLabel: string | null;
}

export interface MetricBaseline {
  trailing30dMonthlyEquivalent: number;
  trailing90dMonthlyEquivalent: number;
}

export interface GoalBaselines {
  focus_minutes: MetricBaseline;
  focus_sessions: MetricBaseline;
  focus_days: MetricBaseline;
  tasks_completed: MetricBaseline;
  tasks_completed_on_time: MetricBaseline;
}

export function isScopeDeleted(
  scopeKind: string,
  scopeProjectId?: number | null,
  scopeTagId?: number | null,
): boolean {
  if (scopeKind === "project" && (scopeProjectId === null || scopeProjectId === undefined)) {
    return true;
  }
  if (scopeKind === "tag" && (scopeTagId === null || scopeTagId === undefined)) {
    return true;
  }
  return false;
}

export async function getUserTimezone(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  userId: string,
): Promise<string> {
  const [row] = await tx
    .select({ timeZone: notificationSettingsTable.timeZone })
    .from(notificationSettingsTable)
    .where(eq(notificationSettingsTable.userId, userId))
    .limit(1);

  const tz = row?.timeZone || "Asia/Kolkata";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return "Asia/Kolkata";
  }
}

export async function resolveScopeLabel(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  scopeKind: string,
  scopeProjectId?: number | null,
  scopeTagId?: number | null,
): Promise<string> {
  if (scopeKind === "project" && scopeProjectId) {
    const [project] = await tx
      .select({ name: projectsTable.name })
      .from(projectsTable)
      .where(eq(projectsTable.id, scopeProjectId))
      .limit(1);
    return project?.name ?? `Project #${scopeProjectId}`;
  }
  if (scopeKind === "tag" && scopeTagId) {
    const [tag] = await tx
      .select({ name: tagsTable.name })
      .from(tagsTable)
      .where(eq(tagsTable.id, scopeTagId))
      .limit(1);
    return tag?.name ?? `Tag #${scopeTagId}`;
  }
  return "Global";
}

/**
 * Computes progress and actual telemetry value for a specific goal within a month window.
 */
export async function computeGoalActual(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  userId: string,
  goal: {
    metric: string;
    scopeKind: string;
    scopeProjectId?: number | null;
    scopeTagId?: number | null;
  },
  window: MonthWindow,
  timeZone: string,
): Promise<GoalActualResult> {
  // Check scope deletion invariant (§7.1)
  if (isScopeDeleted(goal.scopeKind, goal.scopeProjectId, goal.scopeTagId)) {
    return {
      actual: 0,
      scopeDeleted: true,
      scopeLabel: null,
    };
  }

  const scopeLabel = await resolveScopeLabel(
    tx,
    goal.scopeKind,
    goal.scopeProjectId,
    goal.scopeTagId,
  );

  let actual = 0;

  switch (goal.metric) {
    case "focus_minutes": {
      if (goal.scopeKind === "project" && goal.scopeProjectId) {
        const [res] = await tx
          .select({
            total: sql<number>`coalesce(sum(${focusSessionsTable.elapsedMinutes}), 0)::int`,
          })
          .from(focusSessionsTable)
          .innerJoin(tasksTable, eq(focusSessionsTable.taskId, tasksTable.id))
          .where(
            and(
              eq(focusSessionsTable.userId, userId),
              eq(focusSessionsTable.status, "completed"),
              gte(focusSessionsTable.startedAt, window.start),
              lt(focusSessionsTable.startedAt, window.end),
              eq(tasksTable.projectId, goal.scopeProjectId),
            ),
          );
        actual = Number(res?.total ?? 0);
      } else if (goal.scopeKind === "tag" && goal.scopeTagId) {
        const [res] = await tx
          .select({
            total: sql<number>`coalesce(sum(${focusSessionsTable.elapsedMinutes}), 0)::int`,
          })
          .from(focusSessionsTable)
          .innerJoin(tasksTable, eq(focusSessionsTable.taskId, tasksTable.id))
          .innerJoin(taskTagsTable, eq(tasksTable.id, taskTagsTable.taskId))
          .where(
            and(
              eq(focusSessionsTable.userId, userId),
              eq(focusSessionsTable.status, "completed"),
              gte(focusSessionsTable.startedAt, window.start),
              lt(focusSessionsTable.startedAt, window.end),
              eq(taskTagsTable.tagId, goal.scopeTagId),
            ),
          );
        actual = Number(res?.total ?? 0);
      } else {
        const [res] = await tx
          .select({
            total: sql<number>`coalesce(sum(${focusSessionsTable.elapsedMinutes}), 0)::int`,
          })
          .from(focusSessionsTable)
          .where(
            and(
              eq(focusSessionsTable.userId, userId),
              eq(focusSessionsTable.status, "completed"),
              gte(focusSessionsTable.startedAt, window.start),
              lt(focusSessionsTable.startedAt, window.end),
            ),
          );
        actual = Number(res?.total ?? 0);
      }
      break;
    }

    case "focus_sessions": {
      if (goal.scopeKind === "project" && goal.scopeProjectId) {
        const [res] = await tx
          .select({
            count: sql<number>`count(${focusSessionsTable.id})::int`,
          })
          .from(focusSessionsTable)
          .innerJoin(tasksTable, eq(focusSessionsTable.taskId, tasksTable.id))
          .where(
            and(
              eq(focusSessionsTable.userId, userId),
              eq(focusSessionsTable.status, "completed"),
              gte(focusSessionsTable.startedAt, window.start),
              lt(focusSessionsTable.startedAt, window.end),
              eq(tasksTable.projectId, goal.scopeProjectId),
            ),
          );
        actual = Number(res?.count ?? 0);
      } else if (goal.scopeKind === "tag" && goal.scopeTagId) {
        const [res] = await tx
          .select({
            count: sql<number>`count(${focusSessionsTable.id})::int`,
          })
          .from(focusSessionsTable)
          .innerJoin(tasksTable, eq(focusSessionsTable.taskId, tasksTable.id))
          .innerJoin(taskTagsTable, eq(tasksTable.id, taskTagsTable.taskId))
          .where(
            and(
              eq(focusSessionsTable.userId, userId),
              eq(focusSessionsTable.status, "completed"),
              gte(focusSessionsTable.startedAt, window.start),
              lt(focusSessionsTable.startedAt, window.end),
              eq(taskTagsTable.tagId, goal.scopeTagId),
            ),
          );
        actual = Number(res?.count ?? 0);
      } else {
        const [res] = await tx
          .select({
            count: sql<number>`count(${focusSessionsTable.id})::int`,
          })
          .from(focusSessionsTable)
          .where(
            and(
              eq(focusSessionsTable.userId, userId),
              eq(focusSessionsTable.status, "completed"),
              gte(focusSessionsTable.startedAt, window.start),
              lt(focusSessionsTable.startedAt, window.end),
            ),
          );
        actual = Number(res?.count ?? 0);
      }
      break;
    }

    case "focus_days": {
      // Focus days: distinct calendar days with completed sessions in user timezone
      let rows: { startedAt: Date }[] = [];
      if (goal.scopeKind === "project" && goal.scopeProjectId) {
        rows = await tx
          .select({ startedAt: focusSessionsTable.startedAt })
          .from(focusSessionsTable)
          .innerJoin(tasksTable, eq(focusSessionsTable.taskId, tasksTable.id))
          .where(
            and(
              eq(focusSessionsTable.userId, userId),
              eq(focusSessionsTable.status, "completed"),
              gte(focusSessionsTable.startedAt, window.start),
              lt(focusSessionsTable.startedAt, window.end),
              eq(tasksTable.projectId, goal.scopeProjectId),
            ),
          );
      } else if (goal.scopeKind === "tag" && goal.scopeTagId) {
        rows = await tx
          .select({ startedAt: focusSessionsTable.startedAt })
          .from(focusSessionsTable)
          .innerJoin(tasksTable, eq(focusSessionsTable.taskId, tasksTable.id))
          .innerJoin(taskTagsTable, eq(tasksTable.id, taskTagsTable.taskId))
          .where(
            and(
              eq(focusSessionsTable.userId, userId),
              eq(focusSessionsTable.status, "completed"),
              gte(focusSessionsTable.startedAt, window.start),
              lt(focusSessionsTable.startedAt, window.end),
              eq(taskTagsTable.tagId, goal.scopeTagId),
            ),
          );
      } else {
        rows = await tx
          .select({ startedAt: focusSessionsTable.startedAt })
          .from(focusSessionsTable)
          .where(
            and(
              eq(focusSessionsTable.userId, userId),
              eq(focusSessionsTable.status, "completed"),
              gte(focusSessionsTable.startedAt, window.start),
              lt(focusSessionsTable.startedAt, window.end),
            ),
          );
      }
      const distinctDays = new Set(
        rows.map((r) => localDateInZone(r.startedAt, timeZone)),
      );
      actual = distinctDays.size;
      break;
    }

    case "tasks_completed": {
      if (goal.scopeKind === "project" && goal.scopeProjectId) {
        const [res] = await tx
          .select({
            count: sql<number>`count(${tasksTable.id})::int`,
          })
          .from(tasksTable)
          .where(
            and(
              eq(tasksTable.userId, userId),
              eq(tasksTable.status, "completed"),
              gte(tasksTable.completedAt, window.start),
              lt(tasksTable.completedAt, window.end),
              eq(tasksTable.projectId, goal.scopeProjectId),
            ),
          );
        actual = Number(res?.count ?? 0);
      } else if (goal.scopeKind === "tag" && goal.scopeTagId) {
        const [res] = await tx
          .select({
            count: sql<number>`count(${tasksTable.id})::int`,
          })
          .from(tasksTable)
          .innerJoin(taskTagsTable, eq(tasksTable.id, taskTagsTable.taskId))
          .where(
            and(
              eq(tasksTable.userId, userId),
              eq(tasksTable.status, "completed"),
              gte(tasksTable.completedAt, window.start),
              lt(tasksTable.completedAt, window.end),
              eq(taskTagsTable.tagId, goal.scopeTagId),
            ),
          );
        actual = Number(res?.count ?? 0);
      } else {
        const [res] = await tx
          .select({
            count: sql<number>`count(${tasksTable.id})::int`,
          })
          .from(tasksTable)
          .where(
            and(
              eq(tasksTable.userId, userId),
              eq(tasksTable.status, "completed"),
              gte(tasksTable.completedAt, window.start),
              lt(tasksTable.completedAt, window.end),
            ),
          );
        actual = Number(res?.count ?? 0);
      }
      break;
    }

    case "tasks_completed_on_time": {
      if (goal.scopeKind === "project" && goal.scopeProjectId) {
        const [res] = await tx
          .select({
            count: sql<number>`count(${tasksTable.id})::int`,
          })
          .from(tasksTable)
          .where(
            and(
              eq(tasksTable.userId, userId),
              eq(tasksTable.status, "completed"),
              gte(tasksTable.completedAt, window.start),
              lt(tasksTable.completedAt, window.end),
              isNotNull(tasksTable.dueAt),
              lte(tasksTable.completedAt, tasksTable.dueAt),
              eq(tasksTable.projectId, goal.scopeProjectId),
            ),
          );
        actual = Number(res?.count ?? 0);
      } else if (goal.scopeKind === "tag" && goal.scopeTagId) {
        const [res] = await tx
          .select({
            count: sql<number>`count(${tasksTable.id})::int`,
          })
          .from(tasksTable)
          .innerJoin(taskTagsTable, eq(tasksTable.id, taskTagsTable.taskId))
          .where(
            and(
              eq(tasksTable.userId, userId),
              eq(tasksTable.status, "completed"),
              gte(tasksTable.completedAt, window.start),
              lt(tasksTable.completedAt, window.end),
              isNotNull(tasksTable.dueAt),
              lte(tasksTable.completedAt, tasksTable.dueAt),
              eq(taskTagsTable.tagId, goal.scopeTagId),
            ),
          );
        actual = Number(res?.count ?? 0);
      } else {
        const [res] = await tx
          .select({
            count: sql<number>`count(${tasksTable.id})::int`,
          })
          .from(tasksTable)
          .where(
            and(
              eq(tasksTable.userId, userId),
              eq(tasksTable.status, "completed"),
              gte(tasksTable.completedAt, window.start),
              lt(tasksTable.completedAt, window.end),
              isNotNull(tasksTable.dueAt),
              lte(tasksTable.completedAt, tasksTable.dueAt),
            ),
          );
        actual = Number(res?.count ?? 0);
      }
      break;
    }
  }

  return {
    actual,
    scopeDeleted: false,
    scopeLabel,
  };
}

/**
 * Computes trailing 30-day and 90-day averages across all 5 metrics for baseline guidance.
 */
export async function computeBaselines(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  userId: string,
  timeZone: string,
  now: Date = new Date(),
): Promise<GoalBaselines> {
  const window30d = {
    start: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
    end: now,
  };
  const window90d = {
    start: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000),
    end: now,
  };

  const metrics: GoalMetric[] = [
    "focus_minutes",
    "focus_sessions",
    "focus_days",
    "tasks_completed",
    "tasks_completed_on_time",
  ];

  const baselines: Partial<GoalBaselines> = {};

  for (const metric of metrics) {
    const res30 = await computeGoalActual(
      tx,
      userId,
      { metric, scopeKind: "global" },
      window30d,
      timeZone,
    );
    const res90 = await computeGoalActual(
      tx,
      userId,
      { metric, scopeKind: "global" },
      window90d,
      timeZone,
    );

    // 30 days is 1 month equivalent; 90 days is 3 months equivalent.
    baselines[metric] = {
      trailing30dMonthlyEquivalent: Number(res30.actual.toFixed(1)),
      trailing90dMonthlyEquivalent: Number((res90.actual / 3).toFixed(1)),
    };
  }

  return baselines as GoalBaselines;
}
