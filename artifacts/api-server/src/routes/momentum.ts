import { and, desc, eq, gte, lt } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { focusSessionsTable, focusSettingsTable, tasksTable } from "@workspace/db";
import {
  GetMomentumQueryParams,
  GetMomentumResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { runWithRls } from "../lib/rls";
import { dayBounds } from "../lib/date";
import { computeStreak, dayKeyInZone } from "../lib/momentum";

const router: IRouter = Router();

// One call powering the Activity Rings: tasks due that day, rounds
// completed that day (by start — the day the round belongs to), the daily
// target, and the focus streak (consecutive days ending today/yesterday
// with a completed round; paused sessions don't count).
router.get("/momentum", requireAuth, async (req, res): Promise<void> => {
  const parsed = GetMomentumQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { start, end, date, timeZone } = dayBounds(
    parsed.data.date,
    parsed.data.timezone,
  );

  const snapshot = await runWithRls(req, async (tx) => {
    const dayTasks = await tx
      .select({ status: tasksTable.status })
      .from(tasksTable)
      .where(
        and(
          eq(tasksTable.userId, req.userId!),
          gte(tasksTable.dueAt, start),
          lt(tasksTable.dueAt, end),
        ),
      );
    const rounds = await tx
      .select({ startedAt: focusSessionsTable.startedAt })
      .from(focusSessionsTable)
      .where(
        and(
          eq(focusSessionsTable.userId, req.userId!),
          eq(focusSessionsTable.status, "completed"),
          gte(focusSessionsTable.startedAt, start),
          lt(focusSessionsTable.startedAt, end),
        ),
      );
    const [settings] = await tx
      .select({ dailyTarget: focusSettingsTable.dailyTarget })
      .from(focusSettingsTable)
      .where(eq(focusSettingsTable.userId, req.userId!));
    const cutoff = new Date(start.getTime() - 366 * 86_400_000);
    const history = await tx
      .select({ startedAt: focusSessionsTable.startedAt })
      .from(focusSessionsTable)
      .where(
        and(
          eq(focusSessionsTable.userId, req.userId!),
          eq(focusSessionsTable.status, "completed"),
          gte(focusSessionsTable.startedAt, cutoff),
        ),
      )
      .orderBy(desc(focusSessionsTable.startedAt))
      .limit(500);
    return { dayTasks, rounds, settings, history };
  });

  const completed = snapshot.dayTasks.filter(
    (task) => task.status === "completed",
  ).length;
  const dayKeys = new Set(
    snapshot.history.map((row) => dayKeyInZone(row.startedAt, timeZone)),
  );

  res.json(
    GetMomentumResponse.parse({
      date,
      tasksTotal: snapshot.dayTasks.length,
      tasksCompleted: completed,
      roundsCompleted: snapshot.rounds.length,
      roundTarget: snapshot.settings?.dailyTarget ?? 4,
      streakDays: computeStreak(dayKeys, date),
    }),
  );
});

export default router;
