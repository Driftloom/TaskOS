import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import { check, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

/**
 * Per-user focus preferences. One row per user (PK on user_id); the API
 * auto-creates defaults on first read. The daily round target powers the
 * Activity Rings and the momentum endpoint.
 */
export const focusSettingsTable = pgTable(
  "focus_settings",
  {
    userId: text("user_id").primaryKey(),
    dailyTarget: integer("daily_target").notNull().default(4),
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
      "focus_settings_target_check",
      sql`${table.dailyTarget} BETWEEN 1 AND 20`,
    ),
  ],
);

export const insertFocusSettingsSchema = createInsertSchema(
  focusSettingsTable,
).omit({ createdAt: true, updatedAt: true });

export type InsertFocusSettings = z.infer<typeof insertFocusSettingsSchema>;
export type FocusSettings = typeof focusSettingsTable.$inferSelect;
