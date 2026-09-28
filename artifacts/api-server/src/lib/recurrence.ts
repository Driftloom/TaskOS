import { and, eq, isNotNull } from "drizzle-orm";
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
 * ALL users, called nightly by pg_cron.
 *
 * Reads the `tasks.rrule` column (migration 0012) to find templates. Template
 * rows carry the rule; the occurrences they spawn do NOT, so each template
 * expands exactly once per window and cannot recurse. `materializeRecurringTasks`
 * de-duplicates on (user, title, dueAt), so re-running the sweep is idempotent.
 */
export async function materializeAllUsersRecurrence(
  now: Date = new Date(),
): Promise<{ userId: string; created: number; error?: string }[]> {
  const templates = await db
    .selectDistinct({
      userId: tasksTable.userId,
      title: tasksTable.title,
      priority: tasksTable.priority,
      durationMin: tasksTable.durationMin,
      projectId: tasksTable.projectId,
      rrule: tasksTable.rrule,
      startDate: tasksTable.dueAt,
    })
    .from(tasksTable)
    .where(and(isNotNull(tasksTable.rrule), eq(tasksTable.status, "open")));

  const results: { userId: string; created: number; error?: string }[] = [];

  // Group by user so one failing template does not abort the whole run.
  const byUser = new Map<string, typeof templates>();
  for (const t of templates) {
    if (!t.rrule) continue;
    const list = byUser.get(t.userId) ?? [];
    list.push(t);
    byUser.set(t.userId, list);
  }

  for (const [userId, userTemplates] of byUser) {
    let created = 0;
    const errors: string[] = [];
    for (const t of userTemplates) {
      try {
        const made = await materializeRecurringTasks(
          {
            userId,
            title: t.title,
            priority: t.priority === "low" || t.priority === "high" ? t.priority : "medium",
            durationEstMin: t.durationMin,
            projectId: t.projectId,
            rrule: t.rrule!,
            startDate: t.startDate ?? now,
          },
          now,
        );
        created += made.length;
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }
    results.push(
      errors.length ? { userId, created, error: errors.join("; ") } : { userId, created },
    );
  }

  return results;
}

