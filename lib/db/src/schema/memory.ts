import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  integer,
  jsonb,
  pgTable,
  real,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";

/**
 * Structured facts tier: durable learned patterns that alter system behavior.
 * Source A (behavioral arithmetic) auto-updates without user confirmation.
 * Source B (conversational LLM) prompts the user before updating/archiving.
 */
export const memoryFactsTable = pgTable(
  "memory_facts",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    key: text("key").notNull(),
    title: text("title").notNull(),
    category: text("category").notNull().default("custom"),
    value: jsonb("value").notNull().default(sql`'{}'::jsonb`),
    source: text("source").notNull(),
    confidence: integer("confidence").notNull(),
    evidenceCount: integer("evidence_count").notNull().default(1),
    lastReinforcedAt: timestamp("last_reinforced_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    archived: boolean("archived").notNull().default(false),
    pendingConfirmation: boolean("pending_confirmation").notNull().default(false),
    confirmationPrompt: text("confirmation_prompt"),
    rule9Multiplier: real("rule9_multiplier"),
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
      "memory_facts_source_check",
      sql`${table.source} IN ('behavioral', 'conversational')`,
    ),
    check(
      "memory_facts_confidence_check",
      sql`${table.confidence} BETWEEN 0 AND 100`,
    ),
    check(
      "memory_facts_category_check",
      sql`${table.category} IN ('procrastination', 'channel', 'soft_commitment', 'hackathon', 'chronotype', 'custom')`,
    ),
  ],
);

/**
 * Semantic memory tier: stores embeddings of unstructured notes and transcripts.
 */
export const memoryEmbeddingsTable = pgTable("memory_embeddings", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  sourceText: text("source_text").notNull(),
  metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
  embedding: text("embedding").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertMemoryFactSchema = createInsertSchema(memoryFactsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertMemoryEmbeddingSchema = createInsertSchema(
  memoryEmbeddingsTable,
).omit({ id: true, createdAt: true });

export type InsertMemoryFact = z.infer<typeof insertMemoryFactSchema>;
export type MemoryFact = typeof memoryFactsTable.$inferSelect;
export type InsertMemoryEmbedding = z.infer<typeof insertMemoryEmbeddingSchema>;
export type MemoryEmbedding = typeof memoryEmbeddingsTable.$inferSelect;
