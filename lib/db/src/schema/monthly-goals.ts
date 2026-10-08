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
  varchar,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { projectsTable } from "./projects";
import { tagsTable } from "./tags";

export const monthlyGoalsTable = pgTable(
  "monthly_goals",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    title: text("title").notNull(),
    month: varchar("month", { length: 7 }).notNull(),
    metric: text("metric").notNull(),
    target: integer("target").notNull(),
    scopeKind: text("scope_kind").notNull().default("global"),
    scopeProjectId: integer("scope_project_id").references(() => projectsTable.id, {
      onDelete: "set null",
    }),
    scopeTagId: integer("scope_tag_id").references(() => tagsTable.id, {
      onDelete: "set null",
    }),
    status: text("status").notNull().default("open"),
    carriedFromId: integer("carried_from_id").references((): AnyPgColumn => monthlyGoalsTable.id, {
      onDelete: "set null",
    }),
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
      "monthly_goals_title_check",
      sql`char_length(trim(${table.title})) BETWEEN 1 AND 120`,
    ),
    check(
      "monthly_goals_month_format_check",
      sql`${table.month} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`,
    ),
    check("monthly_goals_target_check", sql`${table.target} > 0`),
    check("monthly_goals_status_check", sql`${table.status} IN ('open', 'closed')`),
    check(
      "monthly_goals_metric_check",
      sql`${table.metric} IN ('focus_minutes', 'focus_sessions', 'focus_days', 'tasks_completed', 'tasks_completed_on_time')`,
    ),
    check(
      "monthly_goals_scope_check",
      sql`(${table.scopeKind} = 'global' AND ${table.scopeProjectId} IS NULL AND ${table.scopeTagId} IS NULL) OR (${table.scopeKind} = 'project' AND ${table.scopeProjectId} IS NOT NULL AND ${table.scopeTagId} IS NULL) OR (${table.scopeKind} = 'tag' AND ${table.scopeTagId} IS NOT NULL AND ${table.scopeProjectId} IS NULL)`,
    ),
    index("monthly_goals_user_month_idx").on(table.userId, table.month, table.status),
  ],
);

export const insertMonthlyGoalSchema = createInsertSchema(monthlyGoalsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertMonthlyGoal = z.infer<typeof insertMonthlyGoalSchema>;
export type MonthlyGoal = typeof monthlyGoalsTable.$inferSelect;

export const monthlyGoalSnapshotsTable = pgTable(
  "monthly_goal_snapshots",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    goalId: integer("goal_id").references(() => monthlyGoalsTable.id, {
      onDelete: "set null",
    }),
    month: varchar("month", { length: 7 }).notNull(),
    title: text("title").notNull(),
    metric: text("metric").notNull(),
    target: integer("target").notNull(),
    finalActual: integer("final_actual").notNull(),
    achieved: boolean("achieved").notNull(),
    scopeKind: text("scope_kind").notNull(),
    scopeLabel: text("scope_label").notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check("monthly_goal_snapshots_target_check", sql`${table.target} > 0`),
    check("monthly_goal_snapshots_actual_check", sql`${table.finalActual} >= 0`),
    check(
      "monthly_goal_snapshots_month_format_check",
      sql`${table.month} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`,
    ),
    index("monthly_goal_snapshots_user_month_idx").on(table.userId, table.month),
  ],
);

export const insertMonthlyGoalSnapshotSchema = createInsertSchema(
  monthlyGoalSnapshotsTable,
).omit({
  id: true,
  closedAt: true,
});

export type InsertMonthlyGoalSnapshot = z.infer<typeof insertMonthlyGoalSnapshotSchema>;
export type MonthlyGoalSnapshot = typeof monthlyGoalSnapshotsTable.$inferSelect;
