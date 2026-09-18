import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { tasksTable } from "./tasks";

/**
 * Ask-mode proposals: when the automation dial is `ask`, the sweep writes a
 * proposal instead of moving the task. Accepting applies the move (subject
 * to the same cap/validity checks); declining or superseding closes it.
 * One pending proposal per task — re-running the sweep never duplicates.
 */
export const rescheduleProposalsTable = pgTable(
  "reschedule_proposals",
  {
    id: serial("id").primaryKey(),
    // No default: every insert must supply the authenticated Clerk user ID
    // (DB-level default lives in migration 0008).
    userId: text("user_id").notNull(),
    taskId: integer("task_id")
      .notNull()
      .references(() => tasksTable.id, { onDelete: "cascade" }),
    fromDue: timestamp("from_due", { withTimezone: true }),
    toDue: timestamp("to_due", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("pending"),
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
      "reschedule_proposals_status_check",
      sql`${table.status} IN ('pending', 'accepted', 'declined', 'expired')`,
    ),
  ],
);

export const rescheduleRunsTable = pgTable("reschedule_runs", {
  id: serial("id").primaryKey(),
  startedAt: timestamp("started_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  checked: integer("checked").notNull().default(0),
  moved: integer("moved").notNull().default(0),
  flagged: integer("flagged").notNull().default(0),
  proposed: integer("proposed").notNull().default(0),
  note: text("note"),
});

/**
 * Per-user reschedule dial. defaultMode applies when a task leaves
 * `automation` NULL; maxMoves caps auto-moves per task (corpus default 3,
 * adjustable 1..10). Auto-created with defaults on first settings read.
 */
export const rescheduleSettingsTable = pgTable(
  "reschedule_settings",
  {
    userId: text("user_id").primaryKey(),
    defaultMode: text("default_mode").notNull().default("ask"),
    maxMoves: integer("max_moves").notNull().default(3),
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
      "reschedule_settings_mode_check",
      sql`${table.defaultMode} IN ('off', 'ask', 'auto')`,
    ),
    check(
      "reschedule_settings_moves_check",
      sql`${table.maxMoves} BETWEEN 1 AND 10`,
    ),
  ],
);

export const insertRescheduleProposalSchema = createInsertSchema(
  rescheduleProposalsTable,
).omit({ id: true, createdAt: true, updatedAt: true });

export type InsertRescheduleProposal = z.infer<
  typeof insertRescheduleProposalSchema
>;
export type RescheduleProposal = typeof rescheduleProposalsTable.$inferSelect;
