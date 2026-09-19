import { and, eq } from "drizzle-orm";
import { db, tasksTable, type Task } from "@workspace/db";

export interface RecurringTaskTemplate {
  userId: string;
  title: string;
  priority?: "low" | "medium" | "high" | "urgent";
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
            durationEstMin,
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
