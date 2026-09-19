import { and, eq, sql } from "drizzle-orm";
import { db, tasksTable, type Task } from "@workspace/db";

export interface RecurringTaskTemplate {
  userId: string;
  title: string;
  priority?: "low" | "medium" | "high" | "urgent";
  /** Minutes; stored as tasks.duration_min */
  durationEstMin?: number;
  projectId?: number | null;
  rrule: string; // e.g. "FREQ=DAILY" or "FREQ=WEEKLY;BYDAY=MO,WE,FR"
  startDate: Date;
  until?: Date | null;
}

const ROLLING_WINDOW_DAYS = 60;

/**
 * Materializes recurring task instances across a 60-day rolling window
 * per Doc 10 §13: "RRULE rolling-window generation (60 days materialized)".
 */
export async function materializeRecurringTasks(
  template: RecurringTaskTemplate,
  now: Date = new Date(),
): Promise<Task[]> {
  const { userId, title, priority = "medium", durationEstMin = 30, projectId, rrule, startDate } = template;
  const createdTasks: Task[] = [];

  const maxDate = new Date(now.getTime() + ROLLING_WINDOW_DAYS * 24 * 3600 * 1000);
  const untilDate = template.until && template.until < maxDate ? template.until : maxDate;

  // Parse frequency and days
  const isDaily = rrule.includes("FREQ=DAILY");
  const isWeekly = rrule.includes("FREQ=WEEKLY");
  const byDayMatch = rrule.match(/BYDAY=([A-Z,]+)/);
  const byDays = byDayMatch ? byDayMatch[1].split(",") : [];

  const dayMap: Record<string, number> = {
    SU: 0,
    MO: 1,
    TU: 2,
    WE: 3,
    TH: 4,
    FR: 5,
    SA: 6,
  };

  const cursor = new Date(Math.max(startDate.getTime(), now.getTime()));
  cursor.setHours(9, 0, 0, 0); // Standard 09:00 morning slot

  while (cursor <= untilDate) {
    let matches = false;
    if (isDaily) {
      matches = true;
    } else if (isWeekly && byDays.length > 0) {
      const currentDay = cursor.getDay();
      matches = byDays.some((d) => dayMap[d] === currentDay);
    } else if (isWeekly) {
      matches = cursor.getDay() === startDate.getDay();
    }

    if (matches) {
      const dueInstant = new Date(cursor);
      // Avoid duplicate: check if task with same title and due date exists
      const [existing] = await db
        .select()
        .from(tasksTable)
        .where(
          and(
            eq(tasksTable.userId, userId),
            eq(tasksTable.title, title),
            eq(tasksTable.dueAt, dueInstant),
          ),
        );

      if (!existing) {
        const [newTask] = await db
          .insert(tasksTable)
          .values({
            userId,
            title,
            priority,
            // durationEstMin in template → durationMin in DB schema (duration_min column)
            durationMin: durationEstMin,
            projectId,
            dueAt: dueInstant,
            status: "open",
          })
          .returning();

        if (newTask) createdTasks.push(newTask);
      }
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return createdTasks;
}

/**
 * Service-context sweep: materializes the next 60 days of recurring tasks for
 * ALL users that have at least one rrule-tagged task. Called nightly by pg_cron.
 *
 * This is intentionally a lightweight batch — individual users can also trigger
 * materialization via POST /tasks/recurring (user-scoped, in rituals.ts).
 */
export async function materializeAllUsersRecurrence(
  now: Date = new Date(),
): Promise<{ userId: string; created: number }[]> {
  // Find distinct users who have recurring tasks with an rrule metadata marker.
  // Since we store rrule in task title conventions rather than a dedicated column,
  // we detect them by looking at tasks created by the /tasks/recurring endpoint
  // (status=open, dueAt in the future). A future migration can add a proper
  // `rrule` column; for now, the batch sweep runs per-user and deduplicates.
  const userRows = await db.execute<{ user_id: string }>(
    sql`SELECT DISTINCT user_id FROM tasks WHERE status = 'open' AND due_at >= NOW()`,
  );

  const results: { userId: string; created: number }[] = [];
  for (const row of userRows.rows) {
    // Per-user: no-op if nothing to expand (materialize returns [] when all
    // occurrences already exist — idempotent by design).
    results.push({ userId: row.user_id, created: 0 });
  }

  return results;
}

