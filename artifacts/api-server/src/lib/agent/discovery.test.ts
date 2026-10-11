import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  discoverProviderModels,
  formatModelBadge,
  type DiscoveredModel,
} from "./discovery";

describe("discoverProviderModels", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("successfully discovers and formats Google Gemini models from v1beta/models", async () => {
    const mockGeminiResponse = {
      models: [
        {
          name: "models/gemini-1.5-flash",
          displayName: "Gemini 1.5 Flash",
          description: "Fast model",
          supportedGenerationMethods: ["generateContent", "countTokens"],
        },
        {
          name: "models/gemini-3.8-flash",
          displayName: "Gemini 3.8 Flash",
          description: "Frontier workhorse",
          supportedGenerationMethods: ["generateContent"],
        },
        {
          name: "models/gemini-3.8-flash-lite",
          displayName: "Gemini 3.8 Flash Lite",
          description: "Ultra low latency",
          supportedGenerationMethods: ["generateContent"],
        },
        {
          name: "models/gemini-3.1-pro",
          displayName: "Gemini 3.1 Pro",
          description: "Deep reasoning",
          supportedGenerationMethods: ["generateContent"],
        },
        {
          name: "models/text-embedding-004",
          displayName: "Embedding Model",
          supportedGenerationMethods: ["embedContent"], // should be filtered out!
        },
      ],
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockGeminiResponse,
    } as any);

    const result = await discoverProviderModels("gemini", "valid-gemini-key");

    expect(result.success).toBe(true);
    expect(result.defaultModel).toBe("gemini-3.8-flash");
    expect(result.models.length).toBe(4); // text-embedding-004 filtered out
    expect(result.models.map((m) => m.id)).toContain("gemini-3.8-flash");
    expect(result.models.map((m) => m.id)).toContain("gemini-3.8-flash-lite");
    expect(result.models.map((m) => m.id)).toContain("gemini-3.1-pro");

    const flash38 = result.models.find((m) => m.id === "gemini-3.8-flash");
    expect(flash38?.badge).toBe("Recommended");
    expect(flash38?.tier).toBe("balanced");

    const flashLite = result.models.find((m) => m.id === "gemini-3.8-flash-lite");
    expect(flashLite?.badge).toBe("Cheapest");
    expect(flashLite?.tier).toBe("speed");

    const pro31 = result.models.find((m) => m.id === "gemini-3.1-pro");
    expect(pro31?.badge).toBe("Advanced");
    expect(pro31?.tier).toBe("reasoning");
  });

  it("handles invalid Gemini API key with friendly error message", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error: {
          code: 400,
          message: "API key not valid. Please pass a valid API key.",
          status: "INVALID_ARGUMENT",
        },
      }),
    } as any);

    const result = await discoverProviderModels("gemini", "bad-key");

    expect(result.success).toBe(false);
    expect(result.models.length).toBe(0);
    expect(result.error).toMatch(/Invalid Google Gemini API key/i);
  });

  it("successfully discovers Groq models from /v1/models", async () => {
    const mockGroqResponse = {
      data: [
        { id: "llama-3.3-70b-versatile", active: true },
        { id: "llama-3.1-8b-instant", active: true },
        { id: "whisper-large-v3", active: true }, // audio, should filter or categorize
      ],
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockGroqResponse,
    } as any);

    const result = await discoverProviderModels("groq", "gsk_valid_key");

    expect(result.success).toBe(true);
    expect(result.models.map((m) => m.id)).toContain("llama-3.3-70b-versatile");
    expect(result.models.map((m) => m.id)).toContain("llama-3.1-8b-instant");
    expect(result.defaultModel).toBe("llama-3.3-70b-versatile");
  });

  it("falls back gracefully to curated models on network timeout", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network timeout"));

    const result = await discoverProviderModels("gemini", "some-key");

    // Falls back gracefully so user is not completely blocked
    expect(result.success).toBe(true);
    expect(result.models.length).toBeGreaterThan(0);
    expect(result.models.some((m) => m.id.includes("3.8-flash") || m.id.includes("2.0-flash"))).toBe(true);
  });
});
