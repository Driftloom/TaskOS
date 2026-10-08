import { and, eq, gte, lt, lte } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { z } from "zod";
import {
  focusSessionsTable,
  focusSettingsTable,
  tasksTable,
  timeBlocksTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { runWithRls } from "../lib/rls";
import { materializeRecurringTasks } from "../lib/recurrence";
import { getUserTimezone } from "../lib/goals-metrics";
import { resolveDayWindow } from "../lib/month-window";

const router: IRouter = Router();

const CloseDaySchema = z.object({
  rollForwardUnfinished: z.boolean().default(true),
  targetDate: z.string().optional(), // ISO date or YYYY-MM-DD
});

const CreateRecurringTaskSchema = z.object({
  title: z.string().min(1),
  rrule: z.string().min(1), // e.g. FREQ=DAILY or FREQ=WEEKLY;BYDAY=MO,WE,FR
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  durationEstMin: z.number().int().min(5).max(480).default(30),
  projectId: z.number().int().optional().nullable(),
  startDate: z.string().optional(),
  until: z.string().optional().nullable(),
});

/**
 * Morning Ritual ("Plan My Day"): Aggregates overdue tasks, today's time blocks,
 * and focus targets for planning the day.
 */
router.get("/rituals/plan-day", requireAuth, async (req, res): Promise<void> => {
  const plan = await runWithRls(req, async (tx) => {
    const tz = await getUserTimezone(tx, req.userId!);
    const now = new Date();
    const { start: startOfDay, end: endOfDay } = resolveDayWindow(now, tz);

    // Overdue open tasks
    const overdueTasks = await tx
      .select()
      .from(tasksTable)
      .where(
        and(
          eq(tasksTable.userId, req.userId!),
          eq(tasksTable.status, "open"),
          lt(tasksTable.dueAt, startOfDay),
        ),
      );

    // Today's scheduled tasks
    const todayTasks = await tx
      .select()
      .from(tasksTable)
      .where(
        and(
          eq(tasksTable.userId, req.userId!),
          eq(tasksTable.status, "open"),
          gte(tasksTable.dueAt, startOfDay),
          lt(tasksTable.dueAt, endOfDay),
        ),
      );

    // Today's scheduled calendar blocks
    const todayBlocks = await tx
      .select()
      .from(timeBlocksTable)
      .where(
        and(
          eq(timeBlocksTable.userId, req.userId!),
          gte(timeBlocksTable.startAt, startOfDay),
          lt(timeBlocksTable.startAt, endOfDay),
        ),
      );

    // Focus target settings
    const [settings] = await tx
      .select()
      .from(focusSettingsTable)
      .where(eq(focusSettingsTable.userId, req.userId!));

    return {
      date: startOfDay.toISOString().split("T")[0],
      overdueTasks,
      todayTasks,
      todayBlocks,
      dailyFocusTarget: settings?.dailyTarget ?? 4,
    };
  });

  res.json(plan);
});

/**
 * Evening Ritual ("Close My Day"): Rolls forward unfinished tasks,
 * closes today's ledger, and reports progress summary.
 */
router.post("/rituals/close-day", requireAuth, async (req, res): Promise<void> => {
  const parsed = CloseDaySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const now = new Date();
  const tomorrow = parsed.data.targetDate
    ? new Date(parsed.data.targetDate)
    : new Date(now.getTime() + 24 * 3600 * 1000);
  tomorrow.setHours(9, 0, 0, 0);

  const summary = await runWithRls(req, async (tx) => {
    const tz = await getUserTimezone(tx, req.userId!);
    const { start: startOfDay, end: endOfDay } = resolveDayWindow(now, tz);

    // Tasks completed today
    const completedToday = await tx
      .select()
      .from(tasksTable)
      .where(
        and(
          eq(tasksTable.userId, req.userId!),
          eq(tasksTable.status, "completed"),
          gte(tasksTable.completedAt, startOfDay),
          lt(tasksTable.completedAt, endOfDay),
        ),
      );

    // Focus sessions completed today
    const focusSessions = await tx
      .select()
      .from(focusSessionsTable)
      .where(
        and(
          eq(focusSessionsTable.userId, req.userId!),
          gte(focusSessionsTable.startedAt, startOfDay),
          lt(focusSessionsTable.startedAt, endOfDay),
        ),
      );

    let totalFocusSeconds = 0;
    for (const s of focusSessions) {
      totalFocusSeconds += s.elapsedMinutes * 60;
    }

    let movedCount = 0;
    if (parsed.data.rollForwardUnfinished) {
      // Find open tasks due on or before today
      const openTasks = await tx
        .select()
        .from(tasksTable)
        .where(
          and(
            eq(tasksTable.userId, req.userId!),
            eq(tasksTable.status, "open"),
            lt(tasksTable.dueAt, endOfDay),
          ),
        );

      for (const t of openTasks) {
        await tx
          .update(tasksTable)
          .set({
            dueAt: tomorrow,
            rescheduleCount: t.rescheduleCount + 1,
            updatedAt: new Date(),
          })
          .where(eq(tasksTable.id, t.id));
        movedCount += 1;
      }
    }

    return {
      completedCount: completedToday.length,
      focusRoundsCompleted: focusSessions.length,
      focusMinutesTotal: Math.round(totalFocusSeconds / 60),
      movedToTomorrowCount: movedCount,
      targetDate: tomorrow.toISOString(),
    };
  });

  res.json(summary);
});

/**
 * Materialize recurring tasks (RRULE 60-day rolling window).
 */
router.post("/tasks/recurring", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateRecurringTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const startDate = parsed.data.startDate ? new Date(parsed.data.startDate) : new Date();
  const until = parsed.data.until ? new Date(parsed.data.until) : null;

  const createdTasks = await materializeRecurringTasks({
    userId: req.userId!,
    title: parsed.data.title,
    priority: parsed.data.priority,
    durationEstMin: parsed.data.durationEstMin,
    projectId: parsed.data.projectId,
    rrule: parsed.data.rrule,
    startDate,
    until,
  });

  // Persist the rule on a template row so the nightly sweep can find and
  // re-expand it. Without this the rrule was accepted and discarded, and
  // /internal/recurrence-materialize reported success while creating nothing.
  // The template itself is not a to-do, so it is created with status 'inbox'
  // and no due date of its own beyond the start anchor.
  const [template] = await runWithRls(req, async (tx) =>
    tx
      .insert(tasksTable)
      .values({
        userId: req.userId!,
        title: parsed.data.title,
        priority: parsed.data.priority,
        durationMin: parsed.data.durationEstMin,
        projectId: parsed.data.projectId ?? null,
        rrule: parsed.data.rrule,
        dueAt: startDate,
        status: "inbox",
      })
      .returning({ id: tasksTable.id }),
  );

  res.status(201).json({
    createdCount: createdTasks.length,
    templateId: template?.id ?? null,
    tasks: createdTasks,
  });
});

export default router;
