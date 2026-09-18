import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import { check, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { tasksTable } from "./tasks";

/**
 * Links to files, not the files themselves: there is deliberately no storage
 * vendor in this project (no decision exists in the corpus), so attachments
 * are URLs the user pastes (Drive, Dropbox, notes app links, …).
 * Links die with their task (CASCADE) and never block its deletion.
 */
export const taskFilesTable = pgTable(
  "task_files",
  {
    id: serial("id").primaryKey(),
    // No default: every insert must supply the authenticated Clerk user ID
    // (DB-level default lives in migration 0004).
    userId: text("user_id").notNull(),
    taskId: integer("task_id")
      .notNull()
      .references(() => tasksTable.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    name: text("name"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "task_files_url_check",
      sql`${table.url} ~ '^https?://' AND char_length(${table.url}) BETWEEN 1 AND 2048`,
    ),
    check(
      "task_files_name_check",
      sql`${table.name} IS NULL OR char_length(${table.name}) BETWEEN 1 AND 120`,
    ),
  ],
);

export const insertTaskFileSchema = createInsertSchema(taskFilesTable).omit({
  id: true,
  createdAt: true,
});

export type InsertTaskFile = z.infer<typeof insertTaskFileSchema>;
export type TaskFile = typeof taskFilesTable.$inferSelect;
