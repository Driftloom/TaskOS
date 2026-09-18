import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import { check, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const projectsTable = pgTable(
  "projects",
  {
    id: serial("id").primaryKey(),
    // No default: every insert must supply the authenticated Clerk user ID.
    // The DB-level default lives in migration 0002 (auth.jwt()->>'sub');
    // app code always sets userId explicitly.
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    color: text("color"),
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
      "projects_name_check",
      sql`char_length(${table.name}) BETWEEN 1 AND 80`,
    ),
    check(
      "projects_color_check",
      sql`${table.color} IS NULL OR ${table.color} ~ '^#[0-9A-Fa-f]{6}$'`,
    ),
  ],
);

export const insertProjectSchema = createInsertSchema(projectsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projectsTable.$inferSelect;
