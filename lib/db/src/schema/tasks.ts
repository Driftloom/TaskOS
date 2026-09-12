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

export const tasksTable = pgTable(
  "tasks",
  {
    id: serial("id").primaryKey(),
    // No default: every insert must supply the authenticated Clerk user ID.
    // The DB-level default lives in the RLS migration
    // (auth.jwt()->>'sub'); app code always sets userId explicitly.
    userId: text("user_id").notNull(),
    title: text("title").notNull(),
    notes: text("notes"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    durationMin: integer("duration_min").notNull().default(30),
    priority: text("priority").notNull().default("medium"),
    status: text("status").notNull().default("open"),
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
      "tasks_priority_check",
      sql`${table.priority} IN ('low', 'medium', 'high')`,
    ),
    check(
      "tasks_status_check",
      sql`${table.status} IN ('inbox', 'open', 'completed')`,
    ),
  ],
);

export const insertTaskSchema = createInsertSchema(tasksTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasksTable.$inferSelect;