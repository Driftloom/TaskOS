import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { tasksTable } from "./tasks";

export const remindersTable = pgTable(
  "reminders",
  {
    id: serial("id").primaryKey(),
    // No default: every insert must supply the authenticated Clerk user ID
    // (DB-level default lives in migration 0006).
    userId: text("user_id").notNull(),
    taskId: integer("task_id")
      .notNull()
      .references(() => tasksTable.id, { onDelete: "cascade" }),
    remindAt: timestamp("remind_at", { withTimezone: true }).notNull(),
    channel: text("channel").notNull().default("telegram"),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // v1 ships telegram only; the CHECK keeps junk channels out at the DB.
    check(
      "reminders_channel_check",
      sql`${table.channel} IN ('telegram')`,
    ),
    check(
      "reminders_status_check",
      sql`${table.status} IN ('pending', 'sending', 'sent', 'failed', 'canceled')`,
    ),
    // The dispatcher's hot query: due rows first. Covers the whole WHERE.
    index("reminders_due_idx").on(table.status, table.remindAt),
  ],
);

export const reminderRunsTable = pgTable("reminder_runs", {
  id: serial("id").primaryKey(),
  startedAt: timestamp("started_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  checked: integer("checked").notNull().default(0),
  sent: integer("sent").notNull().default(0),
  failed: integer("failed").notNull().default(0),
  skipped: integer("skipped").notNull().default(0),
  note: text("note"),
});

export const insertReminderSchema = createInsertSchema(remindersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertReminder = z.infer<typeof insertReminderSchema>;
export type Reminder = typeof remindersTable.$inferSelect;
