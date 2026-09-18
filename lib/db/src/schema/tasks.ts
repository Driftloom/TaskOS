import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { projectsTable } from "./projects";

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
    // Nullable: unfiled tasks have NULL. Deleting a project SETs NULL
    // (tasks survive, unfiled) instead of wiping work.
    projectId: integer("project_id").references(() => projectsTable.id, {
      onDelete: "set null",
    }),
    // Nullable self-reference for subtasks. Deleting a parent with children
    // FAILS (RESTRICT) — clients delete or reparent children first, so no
    // work ever disappears silently. Cycles are rejected app-side; the DB
    // at least forbids self-parenting.
    parentId: integer("parent_id").references((): AnyPgColumn => tasksTable.id, {
      onDelete: "restrict",
    }),
    // Reschedule engine state. rescheduleCount counts AUTO moves only
    // (manual edits never increment); at maxMoves the task is flagged.
    // automation NULL inherits the user's reschedule_settings.default_mode.
    rescheduleCount: integer("reschedule_count").notNull().default(0),
    needsAttention: boolean("needs_attention").notNull().default(false),
    automation: text("automation"),
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
    check(
      "tasks_parent_check",
      sql`${table.parentId} IS NULL OR ${table.parentId} != ${table.id}`,
    ),
    check(
      "tasks_automation_check",
      sql`${table.automation} IS NULL OR ${table.automation} IN ('off', 'ask', 'auto')`,
    ),
    // The reschedule sweep's hot query: overdue open work first.
    index("tasks_overdue_idx").on(table.status, table.dueAt),
  ],
);

export const insertTaskSchema = createInsertSchema(tasksTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasksTable.$inferSelect;