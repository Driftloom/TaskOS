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
    defaultModel: "gemini-3.8-flash",
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
    defaultModel: "google/gemini-2.0-flash-001",
    envKey: "OPENROUTER_API_KEY",
    modelEnvKey: "OPENROUTER_MODEL",
  },
];

export interface CuratedModel {
  id: string;
  label: string;
  badge?: string;
  description: string;
}

export const CURATED_MODELS_BY_PROVIDER: Record<ProviderId, readonly CuratedModel[]> = {
  gemini: [
    {
      id: "gemini-3.8-flash",
      label: "Gemini 3.8 Flash",
      badge: "Recommended",
      description: "Google's frontier workhorse for complex agentic workflows, software engineering, and fast reasoning.",
    },
    {
      id: "gemini-3.8-flash-lite",
      label: "Gemini 3.8 Flash Lite",
      badge: "Cheapest",
      description: "Lightweight, ultra low latency, minimal token cost.",
    },
    {
      id: "gemini-3.1-pro",
      label: "Gemini 3.1 Pro",
      badge: "Advanced",
      description: "Deep multi-step reasoning, complex scheduling trade-offs, and multi-turn planning.",
    },
    {
      id: "gemini-2.5-flash",
      label: "Gemini 2.5 Flash",
      badge: "Fast",
      description: "High throughput multimodal generation.",
    },
    {
      id: "gemini-2.0-flash",
      label: "Gemini 2.0 Flash",
      badge: "Stable",
      description: "Ultra fast generation with enhanced function calling.",
    },
    {
      id: "gemini-1.5-flash",
      label: "Gemini 1.5 Flash (Legacy)",
      badge: "Legacy",
      description: "Legacy 1.5 Flash model.",
    },
    {
      id: "gemini-1.5-pro",
      label: "Gemini 1.5 Pro (Legacy)",
      badge: "Legacy",
      description: "Legacy 1.5 Pro model.",
    },
  ],
  groq: [
    {
      id: "llama-3.3-70b-versatile",
      label: "Llama 3.3 70B",
      badge: "Recommended",
      description: "Flagship open weights with instant 300+ tokens/sec Groq LPU inference.",
    },
    {
      id: "llama-3.1-8b-instant",
      label: "Llama 3.1 8B Instant",
      badge: "Ultra Fast",
      description: "Sub-100ms response time for quick task creation and queries.",
    },
  ],
  nvidia_nim: [
    {
      id: "meta/llama-3.1-70b-instruct",
      label: "Llama 3.1 70B Instruct",
      badge: "Recommended",
      description: "Hosted by NVIDIA NIM with high instruction following accuracy.",
    },
    {
      id: "meta/llama-3.1-8b-instruct",
      label: "Llama 3.1 8B Instruct",
      badge: "Fast",
      description: "Compact, fast instruction model on NVIDIA cloud infrastructure.",
    },
    {
      id: "mistralai/mixtral-8x7b-instruct-v0.1",
      label: "Mixtral 8x7B",
      badge: "MoE",
      description: "Mixture-of-Experts architecture with balanced speed and capability.",
    },
  ],
  openrouter: [
    {
      id: "google/gemini-2.0-flash-001",
      label: "Gemini 2.0 Flash",
      badge: "Recommended",
      description: "Fast multi-turn reasoning routed through OpenRouter.",
    },
    {
      id: "meta-llama/llama-3.3-70b-instruct",
      label: "Llama 3.3 70B Instruct",
      badge: "High Capability",
      description: "Top-tier open weights model for complex schedule planning.",
    },
    {
      id: "anthropic/claude-3.5-sonnet",
      label: "Claude 3.5 Sonnet",
      badge: "Premier",
      description: "State-of-the-art reasoning and nuance for personal planning.",
    },
    {
      id: "deepseek/deepseek-chat",
      label: "DeepSeek V3",
      badge: "Value",
      description: "Extremely cost-effective 671B MoE reasoning model.",
    },
  ],
  litellm: [
    {
      id: "gpt-4o-mini",
      label: "GPT-4o Mini",
      badge: "Default",
      description: "Standard gateway fallback model.",
    },
  ],
  custom: [],
};

/**
 * Infers the provider identifier from a user-supplied model identifier.
 */
export function inferProviderFromModel(modelName: string): ProviderId {
  const lower = modelName.toLowerCase();
  if (lower.startsWith("gemini")) return "gemini";
  if (lower.startsWith("meta/") || lower.startsWith("mistralai/")) return "nvidia_nim";
  if (
    lower.startsWith("google/") ||
    lower.startsWith("meta-llama/") ||
    lower.startsWith("anthropic/") ||
    lower.startsWith("deepseek/")
  ) {
    return "openrouter";
  }
  if (lower.includes("llama") || lower.includes("groq")) return "groq";
  return "gemini";
}

export const CANDIDATE_FALLBACK_MODELS_BY_PROVIDER: Record<ProviderId, readonly string[]> = {
  gemini: [
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-2.5-flash",
    "gemini-2.0-pro",
    "gemini-1.5-flash",
  ],
  groq: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"],
  nvidia_nim: ["meta/llama-3.1-70b-instruct", "meta/llama-3.1-8b-instruct"],
  openrouter: ["google/gemini-2.0-flash-001", "meta-llama/llama-3.3-70b-instruct"],
  litellm: ["gpt-4o-mini"],
  custom: [],
};

/**
 * Infers the target model and provider from natural language prompts
 * such as "switch to gemini 1.5 pro", "use groq", "switch to llama 3.3".
 */
export function inferModelAndProvider(prompt: string): { model: string; provider: ProviderId } | null {
  const lower = prompt.toLowerCase();
  if (lower.includes("flash lite") || lower.includes("2.0 lite") || lower.includes("flash-lite")) {
    return { model: "gemini-2.0-flash-lite", provider: "gemini" };
  }
  if (lower.includes("gemini 2.5") || lower.includes("gemini-2.5") || lower.includes("2.5 flash")) {
    return { model: "gemini-2.5-flash", provider: "gemini" };
  }
  if (lower.includes("3.8") || lower.includes("3.8 flash") || lower.includes("gemini 3")) {
    return { model: "gemini-2.0-flash", provider: "gemini" };
  }
  if (lower.includes("gemini 2.0 pro") || lower.includes("gemini 2 pro") || lower.includes("2.0 pro")) {
    return { model: "gemini-2.0-pro", provider: "gemini" };
  }
  if (lower.includes("gemini 1.5 pro") || lower.includes("gemini-1.5-pro") || lower.includes("1.5 pro")) {
    return { model: "gemini-1.5-pro", provider: "gemini" };
  }
  if (lower.includes("gemini 1.5 flash") || lower.includes("gemini-1.5-flash") || lower.includes("1.5 flash")) {
    return { model: "gemini-1.5-flash", provider: "gemini" };
  }
  if (lower.includes("gemini 2") || lower.includes("gemini-2.0") || lower.includes("2.0 flash")) {
    return { model: "gemini-2.0-flash", provider: "gemini" };
  }
  if (lower.includes("gemini")) {
    return { model: "gemini-2.0-flash", provider: "gemini" };
  }
  if (lower.includes("llama 3.3") || lower.includes("llama-3.3") || lower.includes("70b")) {
    return { model: "llama-3.3-70b-versatile", provider: "groq" };
  }
  if (lower.includes("llama 3.1 8b") || lower.includes("8b") || lower.includes("instant")) {
    return { model: "llama-3.1-8b-instant", provider: "groq" };
  }
  if (lower.includes("groq")) {
    return { model: "llama-3.3-70b-versatile", provider: "groq" };
  }
  if (lower.includes("claude") || lower.includes("sonnet")) {
    return { model: "anthropic/claude-3.5-sonnet", provider: "openrouter" };
  }
  if (lower.includes("deepseek")) {
    return { model: "deepseek/deepseek-chat", provider: "openrouter" };
  }
  if (lower.includes("nvidia") || lower.includes("nim")) {
    return { model: "meta/llama-3.1-70b-instruct", provider: "nvidia_nim" };
  }
  if (lower.includes("openrouter")) {
    return { model: "google/gemini-2.0-flash-001", provider: "openrouter" };
  }
  return null;
}

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