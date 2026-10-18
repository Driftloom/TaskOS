import {
  CURATED_MODELS_BY_PROVIDER,
  type CuratedModel,
  type ProviderId,
} from "./providers";

export type ModelTier = "speed" | "balanced" | "reasoning" | "legacy";

export interface DiscoveredModel {
  id: string;
  label: string;
  badge?: string;
  description: string;
  tier: ModelTier;
}

export interface DiscoveryResult {
  success: boolean;
  models: DiscoveredModel[];
  defaultModel: string;
  error?: string;
}

const DISCOVERY_TIMEOUT_MS = 10_000;

export function formatModelBadge(
  id: string,
  metadata?: { displayName?: string; description?: string },
): { label: string; badge?: string; tier: ModelTier; description: string } {
  const lower = id.toLowerCase();
  const label = metadata?.displayName || id;

  if (lower.includes("flash-lite") || lower.includes("lite")) {
    return {
      label,
      badge: "Cheapest",
      tier: "speed",
      description: metadata?.description || "Ultra-low latency and minimal token cost.",
    };
  }
  if (lower.includes("instant")) {
    return {
      label,
      badge: "Ultra Fast",
      tier: "speed",
      description: metadata?.description || "Sub-100ms response time for fast interactions.",
    };
  }
  if (
    lower.includes("2.0-flash") ||
    lower === "gemini-2.0-flash" ||
    lower.includes("3.8-flash")
  ) {
    return {
      label,
      badge: "Recommended",
      tier: "balanced",
      description: metadata?.description || "Frontier workhorse for agentic tool use, speed, and coding.",
    };
  }
  if (lower.includes("flash")) {
    return {
      label,
      badge: "Fast",
      tier: "balanced",
      description: metadata?.description || "High-speed multimodal generation.",
    };
  }
  if (lower.includes("3.1-pro") || lower.includes("3.1 pro")) {
    return {
      label,
      badge: "Advanced",
      tier: "reasoning",
      description: metadata?.description || "Complex multi-step reasoning, coding, and planning.",
    };
  }
  if (lower.includes("pro")) {
    return {
      label,
      badge: "Deep Reasoning",
      tier: "reasoning",
      description: metadata?.description || "Complex multi-step reasoning, coding, and planning.",
    };
  }
  if (lower.includes("70b") || lower.includes("instruct")) {
    return {
      label,
      badge: "High Capability",
      tier: "balanced",
      description: metadata?.description || "High capability instruction following and reasoning.",
    };
  }
  if (lower.includes("8b")) {
    return {
      label,
      badge: "Fast",
      tier: "speed",
      description: metadata?.description || "Compact and fast model.",
    };
  }
  if (lower.includes("moe") || lower.includes("mixtral")) {
    return {
      label,
      badge: "MoE",
      tier: "balanced",
      description: metadata?.description || "Mixture-of-experts balanced throughput.",
    };
  }

  return {
    label,
    badge: undefined,
    tier: "balanced",
    description: metadata?.description || `Model ${id}`,
  };
}

/**
 * Discovers available models for a given provider and API key.
 * Uses provider metadata endpoints (e.g. Google ModelService.ListModels)
 * which consume 0 inference tokens and instantly validate key health.
 */
export async function discoverProviderModels(
  provider: ProviderId,
  apiKey: string,
  baseUrl?: string,
): Promise<DiscoveryResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT_MS);

  try {
    switch (provider) {
      case "gemini": {
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
        const res = await fetch(url, { signal: controller.signal });

        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as any;
          const msg = body?.error?.message || "";
          if (res.status === 400 || res.status === 403 || msg.toLowerCase().includes("api key")) {
            return {
              success: false,
              models: [],
              defaultModel: "",
              error: "Invalid Google Gemini API key. Please check your key from Google AI Studio.",
            };
          }
          throw new Error(`Google API returned status ${res.status}: ${msg}`);
        }

        const data = (await res.json()) as {
          models?: Array<{
            name: string;
            displayName?: string;
            description?: string;
            supportedGenerationMethods?: string[];
          }>;
        };

        const rawList = data.models || [];
        const contentModels = rawList.filter((m) =>
          m.supportedGenerationMethods?.includes("generateContent"),
        );

        const models: DiscoveredModel[] = contentModels.map((m) => {
          const cleanId = m.name.replace(/^models\//, "");
          const formatting = formatModelBadge(cleanId, {
            displayName: m.displayName,
            description: m.description,
          });
          return {
            id: cleanId,
            label: m.displayName || formatting.label,
            badge: formatting.badge,
            tier: formatting.tier,
            description: m.description || formatting.description,
          };
        });

        // Priority sort: active frontier models first, then speed, then reasoning, then legacy
        models.sort((a, b) => {
          const priorityScore = (id: string): number => {
            const lower = id.toLowerCase();
            if (lower === "gemini-2.0-flash") return 1;
            if (lower.includes("3.8-flash") && !lower.includes("lite")) return 2;
            if (lower.includes("2.0-flash-lite") || lower.includes("3.8-flash-lite")) return 3;
            if (lower === "gemini-1.5-pro" || lower.includes("3.1-pro")) return 4;
            if (lower === "gemini-1.5-flash") return 5;
            if (lower.includes("2.0")) return 6;
            if (lower.includes("1.5")) return 7;
            return 50;
          };
          return priorityScore(a.id) - priorityScore(b.id);
        });

        const defaultModel =
          models.find((m) => m.id === "gemini-2.0-flash")?.id ||
          models.find((m) => m.id === "gemini-3.8-flash")?.id ||
          models.find((m) => m.id.includes("flash") && !m.id.includes("lite"))?.id ||
          models[0]?.id ||
          "gemini-2.0-flash";

        return {
          success: true,
          models,
          defaultModel,
        };
      }

      case "groq": {
        const url = "https://api.groq.com/openai/v1/models";
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: controller.signal,
        });

        if (!res.ok) {
          if (res.status === 401) {
            return {
              success: false,
              models: [],
              defaultModel: "",
              error: "Invalid Groq API key. Please check your key from Groq Console.",
            };
          }
          throw new Error(`Groq API returned status ${res.status}`);
        }

        const data = (await res.json()) as { data?: Array<{ id: string; active?: boolean }> };
        const rawList = (data.data || []).filter((m) => m.active !== false);

        // Filter for chat completion models (exclude pure audio whisper)
        const chatModels = rawList.filter(
          (m) => !m.id.toLowerCase().includes("whisper") && !m.id.toLowerCase().includes("embed"),
        );

        const models: DiscoveredModel[] = chatModels.map((m) => {
          const formatting = formatModelBadge(m.id);
          return {
            id: m.id,
            label: formatting.label,
            badge: formatting.badge,
            tier: formatting.tier,
            description: formatting.description,
          };
        });

        models.sort((a, b) => {
          if (a.id.includes("llama-3.3-70b")) return -1;
          if (b.id.includes("llama-3.3-70b")) return 1;
          return 0;
        });

        const defaultModel =
          models.find((m) => m.id === "llama-3.3-70b-versatile")?.id ||
          models[0]?.id ||
          "llama-3.3-70b-versatile";

        return {
          success: true,
          models,
          defaultModel,
        };
      }

      case "openrouter": {
        const url = "https://openrouter.ai/api/v1/models";
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: controller.signal,
        });

        if (!res.ok) {
          if (res.status === 401) {
            return {
              success: false,
              models: [],
              defaultModel: "",
              error: "Invalid OpenRouter API key. Please check your key from openrouter.ai.",
            };
          }
          throw new Error(`OpenRouter API returned status ${res.status}`);
        }

        const data = (await res.json()) as { data?: Array<{ id: string; name?: string; description?: string }> };
        const models: DiscoveredModel[] = (data.data || []).slice(0, 50).map((m) => ({
          id: m.id,
          label: m.name || m.id,
          badge: m.id.includes("gemini") ? "Recommended" : undefined,
          tier: "balanced",
          description: m.description || `OpenRouter model ${m.id}`,
        }));

        return {
          success: true,
          models,
          defaultModel: models[0]?.id || "google/gemini-2.0-flash-001",
        };
      }

      default: {
        // For NVIDIA NIM or Custom: use curated models
        const curated = (CURATED_MODELS_BY_PROVIDER[provider] || []) as CuratedModel[];
        const models: DiscoveredModel[] = curated.map((m) => {
          const formatting = formatModelBadge(m.id);
          return {
            id: m.id,
            label: m.label,
            badge: m.badge || formatting.badge,
            tier: formatting.tier,
            description: m.description,
          };
        });

        return {
          success: true,
          models,
          defaultModel: models[0]?.id || "default",
        };
      }
    }
  } catch (err: any) {
    const curated = (CURATED_MODELS_BY_PROVIDER[provider] || []) as CuratedModel[];
    if (curated.length > 0) {
      const models: DiscoveredModel[] = curated.map((m) => {
        const formatting = formatModelBadge(m.id);
        return {
          id: m.id,
          label: m.label,
          badge: m.badge || formatting.badge,
          tier: formatting.tier,
          description: m.description,
        };
      });
      return {
        success: true,
        models,
        defaultModel: models[0]?.id || "gemini-2.0-flash",
      };
    }

    return {
      success: false,
      models: [],
      defaultModel: "",
      error: `Could not reach ${provider} API: ${err.message}`,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
