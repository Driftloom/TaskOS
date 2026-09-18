import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import { check, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { tasksTable } from "./tasks";

/**
 * Planned work placements on the calendar. A block always belongs to exactly
 * one task (no blank blocks in v1) and never moves tasks.due_at — the block
 * is the plan, due_at stays the deadline.
 *
 * Overlap is rejected app-side (same-transaction check, 400) rather than by
 * an EXCLUDE constraint, keeping the migration free of extra extensions.
 * Deleting a task cascades its blocks; blocks never block task deletion.
 */
export const timeBlocksTable = pgTable(
  "time_blocks",
  {
    id: serial("id").primaryKey(),
    // No default: every insert must supply the authenticated Clerk user ID
    // (DB-level default lives in migration 0005).
    userId: text("user_id").notNull(),
    taskId: integer("task_id")
      .notNull()
      .references(() => tasksTable.id, { onDelete: "cascade" }),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
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
      "time_blocks_range_check",
      sql`${table.endAt} > ${table.startAt}`,
    ),
  ],
);

export const insertTimeBlockSchema = createInsertSchema(timeBlocksTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertTimeBlock = z.infer<typeof insertTimeBlockSchema>;
export type TimeBlock = typeof timeBlocksTable.$inferSelect;
