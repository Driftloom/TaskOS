import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";

/**
 * Per-user notification preferences. One row per user (PK on user_id);
 * the API auto-creates defaults on first read.
 *
 * Quiet hours are a daily window in the user's timezone that the dispatcher
 * always respects (due reminders wait for the window to end). A window with
 * start == end means "no quiet hours". Telegram chat ids are TEXT: Telegram
 * ids can exceed int32, and exactness beats arithmetic here.
 */
export const notificationSettingsTable = pgTable(
  "notification_settings",
  {
    userId: text("user_id").primaryKey(),
    telegramChatId: text("telegram_chat_id"),
    quietStart: integer("quiet_start").notNull().default(22),
    quietEnd: integer("quiet_end").notNull().default(7),
    timeZone: text("timezone").notNull().default("UTC"),
    remindersEnabled: boolean("reminders_enabled").notNull().default(true),
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
      "notification_settings_quiet_check",
      sql`${table.quietStart} BETWEEN 0 AND 23 AND ${table.quietEnd} BETWEEN 0 AND 23`,
    ),
    check(
      "notification_settings_chat_check",
      sql`${table.telegramChatId} IS NULL OR ${table.telegramChatId} ~ '^-?[0-9]{1,19}$'`,
    ),
  ],
);

/**
 * Global automation kill switches. Selectable by `authenticated` (so the
 * dispatcher and health checks can read them) but writable ONLY by the
 * owner — there are deliberately no write policies. Toggle via the
 * Supabase dashboard / SQL editor, never via the API.
 */
export const automationFlagsTable = pgTable("automation_flags", {
  key: text("key").primaryKey(),
  enabled: boolean("enabled").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertNotificationSettingsSchema = createInsertSchema(
  notificationSettingsTable,
).omit({ createdAt: true, updatedAt: true });

export type InsertNotificationSettings = z.infer<
  typeof insertNotificationSettingsSchema
>;
export type NotificationSettings = typeof notificationSettingsTable.$inferSelect;
