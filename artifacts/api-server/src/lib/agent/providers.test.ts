import { describe, it, expect } from "vitest";
import {
  PROVIDER_PRESETS,
  chatCompletionsUrl,
  isUsableSecret,
  resolveProvidersFromEnv,
} from "./providers";

/**
 * The precedence table, and the "empty means absent" rule.
 *
 * This is the regression lock for the incident that started all of this:
 * `.env` shipped `GEMINI_API_KEY=` and `LLM_FALLBACK_KEY=` blank, `engine.ts`
 * read them inline, the guard was skipped, and the assistant returned a canned
 * greeting on every message while the UI reported healthy traffic.
 */

describe("isUsableSecret", () => {
  it("rejects the shapes that made the failure invisible", () => {
    expect(isUsableSecret("")).toBe(false);
    expect(isUsableSecret("   ")).toBe(false);
    expect(isUsableSecret("\t\n")).toBe(false);
    expect(isUsableSecret(undefined)).toBe(false);
    expect(isUsableSecret(null)).toBe(false);
  });

  it("accepts a real key", () => {
    expect(isUsableSecret("sk-abc")).toBe(true);
    expect(isUsableSecret("  sk-abc  ")).toBe(true);
  });
});

describe("resolveProvidersFromEnv", () => {
  it("returns an empty array when nothing is configured", () => {
    // This is the signal that must become a 503, not a greeting.
    expect(resolveProvidersFromEnv({})).toEqual([]);
  });

  it("treats blank keys as unconfigured", () => {
    expect(resolveProvidersFromEnv({ GEMINI_API_KEY: "" })).toEqual([]);
    expect(resolveProvidersFromEnv({ GEMINI_API_KEY: "   " })).toEqual([]);
    expect(resolveProvidersFromEnv({ GROQ_API_KEY: "\n" })).toEqual([]);
  });

  it("resolves each provider from its own env key", () => {
    const providers = resolveProvidersFromEnv({
      GEMINI_API_KEY: "g-key",
      NVIDIA_NIM_API_KEY: "n-key",
      GROQ_API_KEY: "gr-key",
      OPENROUTER_API_KEY: "or-key",
    });

    expect(providers.map((p) => p.id)).toEqual([
      "gemini",
      "nvidia_nim",
      "groq",
      "openrouter",
    ]);
    expect(providers.every((p) => p.source === "env")).toBe(true);
  });

  it("puts an explicit LiteLLM gateway first", () => {
    const providers = resolveProvidersFromEnv({
      LITELLM_BASE_URL: "https://llm.internal/v1",
      LITELLM_API_KEY: "l-key",
      GEMINI_API_KEY: "g-key",
    });

    expect(providers[0].id).toBe("litellm");
    expect(providers[0].baseUrl).toBe("https://llm.internal/v1");
    expect(providers.map((p) => p.id)).toContain("gemini");
  });

  it("requires BOTH LiteLLM url and key — half a config is no config", () => {
    expect(
      resolveProvidersFromEnv({ LITELLM_BASE_URL: "https://llm.internal/v1" }),
    ).toEqual([]);
    expect(resolveProvidersFromEnv({ LITELLM_API_KEY: "l-key" })).toEqual([]);
  });

  it("uses each provider's own default model", () => {
    const providers = resolveProvidersFromEnv({
      GEMINI_API_KEY: "g",
      NVIDIA_NIM_API_KEY: "n",
    });
    const gemini = providers.find((p) => p.id === "gemini")!;
    const nim = providers.find((p) => p.id === "nvidia_nim")!;

    // llama-3.1-70b-instruct is no longer a universal default.
    expect(nim.model).toBe("meta/llama-3.1-70b-instruct");
    expect(gemini.model).toBe("gemini-3.1-flash-lite");
    expect(gemini.model).not.toBe(nim.model);
  });

  it("lets each provider's model be overridden", () => {
    const providers = resolveProvidersFromEnv({
      GEMINI_API_KEY: "g",
      GEMINI_MODEL: "gemini-custom-preview",
      NVIDIA_NIM_API_KEY: "n",
    });
    expect(providers.find((p) => p.id === "gemini")!.model).toBe("gemini-custom-preview");
    expect(providers.find((p) => p.id === "nvidia_nim")!.model).toBe(
      "meta/llama-3.1-70b-instruct",
    );
  });

  it("ignores a blank model override and falls back to the preset default", () => {
    const providers = resolveProvidersFromEnv({
      GEMINI_API_KEY: "g",
      GEMINI_MODEL: "",
    });
    expect(providers[0].model).toBe("gemini-3.1-flash-lite");
  });

  it("trims whitespace around a pasted key", () => {
    const providers = resolveProvidersFromEnv({ GEMINI_API_KEY: "  g-key  \n" });
    expect(providers[0].apiKey).toBe("g-key");
  });

  it("never emits a provider without an api key", () => {
    const providers = resolveProvidersFromEnv({
      GEMINI_API_KEY: "g",
      GROQ_API_KEY: "",
      OPENROUTER_API_KEY: "   ",
      NVIDIA_NIM_API_KEY: "n",
    });
    expect(providers.every((p) => p.apiKey.length > 0)).toBe(true);
    expect(providers.map((p) => p.id)).not.toContain("groq");
    expect(providers.map((p) => p.id)).not.toContain("openrouter");
  });
});

describe("chatCompletionsUrl", () => {
  it("appends /chat/completions to an OpenAI-compatible base", () => {
    expect(chatCompletionsUrl("https://api.groq.com/openai/v1")).toBe(
      "https://api.groq.com/openai/v1/chat/completions",
    );
  });

  it("tolerates a trailing slash", () => {
    // Otherwise a user-supplied custom URL 404s and reads like a bad key.
    expect(chatCompletionsUrl("https://api.groq.com/openai/v1/")).toBe(
      "https://api.groq.com/openai/v1/chat/completions",
    );
    expect(chatCompletionsUrl("https://api.groq.com/openai/v1///")).toBe(
      "https://api.groq.com/openai/v1/chat/completions",
    );
  });

  it("builds a valid Gemini compatibility URL", () => {
    const gemini = PROVIDER_PRESETS.find((p) => p.id === "gemini")!;
    expect(chatCompletionsUrl(gemini.baseUrl)).toBe(
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    );
  });
});

describe("provider presets", () => {
  it("every preset declares an OpenAI-compatible base URL", () => {
    for (const preset of PROVIDER_PRESETS) {
      if (preset.id === "litellm") continue; // base URL comes from env
      expect(preset.baseUrl).toMatch(/^https:\/\//);
      expect(chatCompletionsUrl(preset.baseUrl)).toMatch(/\/chat\/completions$/);
    }
  });

  it("every preset declares its own model env key", () => {
    for (const preset of PROVIDER_PRESETS) {
      expect(preset.modelEnvKey).toMatch(/_MODEL$/);
      expect(preset.defaultModel.length).toBeGreaterThan(0);
    }
  });
});