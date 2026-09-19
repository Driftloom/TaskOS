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
 * Multi-channel conversational transcript history (App chat drawer & Telegram bot).
 */
export const agentConversationsTable = pgTable(
  "agent_conversations",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    channel: text("channel").notNull().default("app"),
    role: text("role").notNull(),
    content: text("content").notNull(),
    toolCalls: jsonb("tool_calls"),
    toolCallId: text("tool_call_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "agent_conversations_channel_check",
      sql`${table.channel} IN ('app', 'telegram')`,
    ),
    check(
      "agent_conversations_role_check",
      sql`${table.role} IN ('user', 'assistant', 'system', 'tool')`,
    ),
  ],
);

/**
 * Reversible agent action log: records state diffs before and after any mutation
 * to support the "undo last agent action" command across UI and Telegram (Doc 09 Gap #2).
 */
export const agentActionLogTable = pgTable("agent_action_log", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: integer("target_id"),
  beforeState: jsonb("before_state"),
  afterState: jsonb("after_state"),
  undone: boolean("undone").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * LLM telemetry & spend ceiling tracker (Doc 08 Problem 5a).
 * Owner-context watchdog logging tokens and cost estimates.
 */
export const llmUsageTable = pgTable("llm_usage", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  model: text("model").notNull(),
  tokensIn: integer("tokens_in").notNull().default(0),
  tokensOut: integer("tokens_out").notNull().default(0),
  costEstimateCents: real("cost_estimate_cents").notNull().default(0),
  endpoint: text("endpoint").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertAgentConversationSchema = createInsertSchema(
  agentConversationsTable,
).omit({ id: true, createdAt: true });

export const insertAgentActionLogSchema = createInsertSchema(
  agentActionLogTable,
).omit({ id: true, createdAt: true });

export const insertLlmUsageSchema = createInsertSchema(llmUsageTable).omit({
  id: true,
  createdAt: true,
});

export type InsertAgentConversation = z.infer<
  typeof insertAgentConversationSchema
>;
export type AgentConversation = typeof agentConversationsTable.$inferSelect;
export type InsertAgentActionLog = z.infer<typeof insertAgentActionLogSchema>;
export type AgentActionLog = typeof agentActionLogTable.$inferSelect;
export type InsertLlmUsage = z.infer<typeof insertLlmUsageSchema>;
export type LlmUsage = typeof llmUsageTable.$inferSelect;
