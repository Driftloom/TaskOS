import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import {
  check,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { tasksTable } from "./tasks";

export const focusSessionsTable = pgTable(
  "focus_sessions",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    // Restrict (default NO ACTION): deleting a task with logged focus
    // sessions fails loudly instead of silently wiping history.
    taskId: integer("task_id")
      .notNull()
      .references(() => tasksTable.id),
    plannedMinutes: integer("planned_minutes").notNull().default(25),
    elapsedMinutes: integer("elapsed_minutes").notNull().default(0),
    status: text("status").notNull().default("active"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    check(
      "focus_sessions_status_check",
      sql`${table.status} IN ('active', 'paused', 'completed', 'canceled')`,
    ),
  ],
);

export const insertFocusSessionSchema = createInsertSchema(
  focusSessionsTable,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertFocusSession = z.infer<typeof insertFocusSessionSchema>;
export type FocusSession = typeof focusSessionsTable.$inferSelect;