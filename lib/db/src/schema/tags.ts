import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import {
  check,
  integer,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { tasksTable } from "./tasks";

export const tagsTable = pgTable(
  "tags",
  {
    id: serial("id").primaryKey(),
    // No default: every insert must supply the authenticated Clerk user ID
    // (DB-level default lives in migration 0002).
    userId: text("user_id").notNull(),
    // Always stored via normalizeTagName (trim + lowercase); uniqueness is
    // per user on the normalized value.
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    check("tags_name_check", sql`char_length(${table.name}) BETWEEN 1 AND 40`),
    unique("tags_user_id_name_unique").on(table.userId, table.name),
  ],
);

export const taskTagsTable = pgTable(
  "task_tags",
  {
    // Restrictive default NO ACTION is unnecessary here: task/tag deletion
    // must cascade the link rows (deleting a task untags it; deleting a tag
    // removes it from tasks) — never orphan, never block.
    taskId: integer("task_id")
      .notNull()
      .references(() => tasksTable.id, { onDelete: "cascade" }),
    tagId: integer("tag_id")
      .notNull()
      .references(() => tagsTable.id, { onDelete: "cascade" }),
    // Denormalized owner for RLS: every policy keys off this column, so
    // link rows are isolated exactly like tasks and tags.
    userId: text("user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.taskId, table.tagId] })],
);

export const insertTagSchema = createInsertSchema(tagsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertTag = z.infer<typeof insertTagSchema>;
export type Tag = typeof tagsTable.$inferSelect;
