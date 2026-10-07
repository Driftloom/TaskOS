import { eq } from "drizzle-orm";
import { decryptCredential } from "./credential-crypto";

/**
 * Resolves which LLM providers this deployment (and this user) can call.
 *
 * ## Why this module exists
 *
 * `engine.ts` used to read the gateway inline:
 *
 * ```ts
 * const gatewayUrl = process.env.LITELLM_BASE_URL ||
 *   (process.env.NVIDIA_NIM_API_KEY ? "https://..." : "");
 * const apiKey = process.env.LITELLM_API_KEY || process.env.NVIDIA_NIM_API_KEY;
 * ```
 *
 * With no key set, `gatewayUrl` was `""`, the `if (gatewayUrl && apiKey)` guard
 * was skipped, and the function fell through to a hardcoded greeting. Nothing
 * surfaced an error, and `llm_usage` was written unconditionally, so the
 * telemetry panel reported healthy traffic. Users saw a friendly message and no
 * functionality, indefinitely.
 *
 * ## The rule this module exists to enforce
 *
 * An empty or whitespace-only value is **absent**, never a usable credential.
 * This repo shipped `.env` with `GEMINI_API_KEY=` and `LLM_FALLBACK_KEY=` blank,
 * and a bare existence check would have treated those as configured. An empty
 * `resolveProviders()` result is the single, unmissable signal that no provider
 * is usable — and it is what turns the greeting into a `503`.
 */

/** Providers with a built-in preset. */
export type ProviderId =
  | "litellm"
  | "gemini"
  | "nvidia_nim"
  | "groq"
  | "openrouter"
  | "custom";

export interface ProviderPreset {
  id: ProviderId;
  label: string;
  baseUrl: string;
  defaultModel: string;
  envKey: string;
  modelEnvKey: string;
}

/**
 * Every preset here is an OpenAI-compatible `POST /chat/completions` endpoint,
 * which is why one request builder serves all of them — including Gemini, whose
 * native API is not OpenAI-shaped but which exposes a compatibility layer at
 * `generativelanguage.googleapis.com/v1beta/openai`.
 *
 * Default models are overridable per provider (`<PROVIDER>_MODEL`, or a per-user
 * `model` on the stored credential). `meta/llama-3.1-70b-instruct` used to be a
 * universal default for a provider nobody had configured; it is now NIM's
 * default only.
 */
export const PROVIDER_PRESETS: readonly ProviderPreset[] = [
  {
    id: "litellm",
    label: "LiteLLM / self-hosted gateway",
    baseUrl: "",
    defaultModel: "gpt-4o-mini",
    envKey: "LITELLM_API_KEY",
    modelEnvKey: "LITELLM_MODEL",
  },
  {
    id: "gemini",
    label: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-3.1-flash-lite",
    envKey: "GEMINI_API_KEY",
    modelEnvKey: "GEMINI_MODEL",
  },
  {
    id: "nvidia_nim",
    label: "NVIDIA NIM",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    defaultModel: "meta/llama-3.1-70b-instruct",
    envKey: "NVIDIA_NIM_API_KEY",
    modelEnvKey: "NVIDIA_NIM_MODEL",
  },
  {
    id: "groq",
    label: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
    envKey: "GROQ_API_KEY",
    modelEnvKey: "GROQ_MODEL",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "google/gemini-2.5-flash",
    envKey: "OPENROUTER_API_KEY",
    modelEnvKey: "OPENROUTER_MODEL",
  },
];

export interface ResolvedProvider {
  id: ProviderId;
  baseUrl: string;
  apiKey: string;
  model: string;
  /** Where the credential came from, for diagnostics and the Settings UI. */
  source: "credential" | "env";
  label: string;
}

/** A value is usable only if it is a non-empty, non-whitespace string. */
export function isUsableSecret(value: string | undefined | null): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function trimmed(value: string | undefined | null): string | undefined {
  return isUsableSecret(value) ? value.trim() : undefined;
}

/**
 * Full `.../chat/completions` URL for a provider.
 *
 * Normalises the trailing slash so a user-supplied `custom` base URL works with
 * or without one — the two spellings otherwise produce a 404 that reads like a
 * bad API key.
 */
export function chatCompletionsUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
}

/**
 * Pure resolver over an environment map. No database, no process.env coupling,
 * so the whole precedence table is unit-testable.
 */
export function resolveProvidersFromEnv(
  env: Record<string, string | undefined>,
): ResolvedProvider[] {
  const out: ResolvedProvider[] = [];

  // LiteLLM first: an explicit self-hosted gateway is a deliberate deployment
  // choice and should win over whatever free-tier key happens to be present.
  const liteBase = trimmed(env.LITELLM_BASE_URL);
  const liteKey = trimmed(env.LITELLM_API_KEY);
  if (liteBase && liteKey) {
    out.push({
      id: "litellm",
      baseUrl: liteBase,
      apiKey: liteKey,
      model: trimmed(env.LITELLM_MODEL) ?? "gpt-4o-mini",
      source: "env",
      label: "LiteLLM / self-hosted gateway",
    });
  }

  for (const preset of PROVIDER_PRESETS) {
    if (preset.id === "litellm") continue;
    const key = trimmed(env[preset.envKey]);
    if (!key) continue;
    out.push({
      id: preset.id,
      baseUrl: preset.baseUrl,
      apiKey: key,
      model: trimmed(env[preset.modelEnvKey]) ?? preset.defaultModel,
      source: "env",
      label: preset.label,
    });
  }

  return out;
}

/** Env-backed providers. Never throws; returns `[]` when nothing is set. */
export function resolveProvidersFromProcessEnv(): ResolvedProvider[] {
  return resolveProvidersFromEnv(process.env as Record<string, string | undefined>);
}

export interface StoredCredential {
  provider: string;
  ciphertext: string;
  baseUrl: string | null;
  model: string | null;
}

/**
 * Providers available to one user: their stored BYOK credential first, then the
 * deployment env vars as a fallback.
 *
 * A stored credential wins over env for the same provider — the user pasted that
 * key deliberately, and it is more specific than an operator-level default. This
 * mirrors the precedence already used for the Telegram token.
 *
 * A decryption failure is logged and the credential skipped rather than thrown:
 * one unreadable row (e.g. after a key rotation) must not take down the agent for
 * users who have a working env key.
 */
export async function resolveProvidersForUser(userId: string): Promise<ResolvedProvider[]> {
  const fromEnv = resolveProvidersFromProcessEnv();
  const out: ResolvedProvider[] = [];
  const seen = new Set<string>();

  try {
    // Imported lazily: `@workspace/db` throws at module load without
    // DATABASE_URL, which would make this file unimportable from a test (and is
    // why `tools.test.ts` copy-pastes its definitions instead of importing them
    // — an anti-pattern this module exists to avoid repeating).
    const { db, llmCredentialsTable } = await import("@workspace/db");

    const rows = await db
      .select({
        provider: llmCredentialsTable.provider,
        ciphertext: llmCredentialsTable.ciphertext,
        baseUrl: llmCredentialsTable.baseUrl,
        model: llmCredentialsTable.model,
      })
      .from(llmCredentialsTable)
      .where(eq(llmCredentialsTable.userId, userId));

    for (const row of rows) {
      let apiKey: string;
      try {
        apiKey = decryptCredential(row.ciphertext);
      } catch {
        // Wrong master key, or the row was tampered with. Skip it; the env
        // fallback still gives the user a working agent.
        continue;
      }
      if (!isUsableSecret(apiKey)) continue;

      if (row.provider === "custom") {
        const base = trimmed(row.baseUrl);
        // A custom provider without a base URL is unusable, not merely odd.
        if (!base) continue;
        out.push({
          id: "custom",
          baseUrl: base,
          apiKey,
          model: trimmed(row.model) ?? "gpt-4o-mini",
          source: "credential",
          label: `Custom (${base})`,
        });
        seen.add("custom");
        continue;
      }

      const preset = PROVIDER_PRESETS.find((p) => p.id === row.provider);
      if (!preset) continue;

      out.push({
        id: preset.id,
        baseUrl: preset.baseUrl,
        apiKey,
        model: trimmed(row.model) ?? preset.defaultModel,
        source: "credential",
        label: preset.label,
      });
      seen.add(preset.id);
    }
  } catch {
    // Table missing (migration not applied) or DB unreachable. Env fallback only.
    return fromEnv;
  }

  for (const provider of fromEnv) {
    if (!seen.has(provider.id)) out.push(provider);
  }

  return out;
}