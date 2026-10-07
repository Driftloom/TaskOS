import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import {
  check,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";

/**
 * Per-user LLM provider credentials for in-app BYOK.
 *
 * Deliberately NOT a `memory_facts` row. `memory_facts.value` is JSONB that
 * backs the user-facing "What Cadence Knows About Me" screen, and integration
 * credentials were being stored there as `category = 'channel'` — which meant
 * `GET /memory/facts`, selecting whole rows, returned the Telegram bot token in
 * plaintext. A provider API key must not share a storage path with display
 * content.
 *
 * Mirrors lib/db/migrations/0016_llm_credentials.sql.
 */
export const llmCredentialsTable = pgTable(
  "llm_credentials",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    provider: text("provider").notNull(),
    /** AES-256-GCM output, base64 `v1:iv:tag:payload`. */
    ciphertext: text("ciphertext").notNull(),
    /** Last few characters only, for the Settings UI. Never the full key. */
    keyHint: text("key_hint").notNull(),
    /** Only meaningful when provider = 'custom'. */
    baseUrl: text("base_url"),
    /** Per-user model override; falls back to the provider default. */
    model: text("model"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "llm_credentials_provider_check",
      sql`${table.provider} IN ('gemini', 'nvidia_nim', 'groq', 'openrouter', 'custom')`,
    ),
    check(
      "llm_credentials_key_hint_check",
      sql`char_length(${table.keyHint}) <= 8`,
    ),
    check(
      "llm_credentials_base_url_check",
      sql`${table.provider} = 'custom' OR ${table.baseUrl} IS NULL`,
    ),
    uniqueIndex("llm_credentials_user_provider_key").on(
      table.userId,
      table.provider,
    ),
  ],
);

export const insertLlmCredentialSchema = createInsertSchema(llmCredentialsTable, {
  userId: false,
}).omit({ id: true, createdAt: true, updatedAt: true });

export type InsertLlmCredential = z.infer<typeof insertLlmCredentialSchema>;
export type LlmCredential = typeof llmCredentialsTable.$inferSelect;

/** Providers with a first-class preset in lib/agent/providers.ts. */
export const LLM_PROVIDERS = [
  "gemini",
  "nvidia_nim",
  "groq",
  "openrouter",
  "custom",
] as const;

export type LlmProvider = (typeof LLM_PROVIDERS)[number];

export function isLlmProvider(value: unknown): value is LlmProvider {
  return (
    typeof value === "string" &&
    (LLM_PROVIDERS as readonly string[]).includes(value)
  );
}