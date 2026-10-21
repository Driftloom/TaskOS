/**
 * Provenance tests: an agent reply must say WHICH provider produced it, and
 * whether the deterministic local engine answered instead.
 *
 * The engine already knew the answer to both questions — `providersTried` was
 * tracked and the local fallback was a separate branch — but nothing carried
 * that knowledge to the wire. A reply from the local engine was byte-for-byte
 * indistinguishable from a reply from a model, so a user on `/agent` could not
 * tell that no model was running.
 *
 * These tests pin the two cases that matter:
 *   - no provider is configured -> the local engine answers, and the reply says
 *     so (`provider: "local-fallback"`, `degraded: true`).
 *   - a provider answers -> the reply names that provider and is not degraded.
 *
 * The provider ids asserted here are the real ones from `./providers`
 * (`ProviderId`): `gemini`, `nvidia_nim`, `groq`, `openrouter`, `litellm`,
 * `custom`. `local-fallback` is the one id that is NOT a credential provider —
 * no key can ever be configured for it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock @workspace/db so the engine never touches a real database.
// Same MockToolHarness shape as agent.test.ts.
// ---------------------------------------------------------------------------

const mockDbSelect = vi.fn();
const mockDbUpdate = vi.fn();
const mockDbInsert = vi.fn();

/** Chain builder that returns itself for .from().where().orderBy().limit() */
function chainable(terminal: () => any) {
  const c: any = {};
  ["from", "where", "orderBy", "limit", "set", "values", "returning"].forEach(
    (m) => {
      c[m] = (..._args: any[]) => c;
    },
  );
  c.then = (resolve: any) => Promise.resolve(terminal()).then(resolve);
  return c;
}

vi.mock("@workspace/db", () => {
  return {
    db: {
      select: (..._args: any[]) => chainable(() => mockDbSelect()),
      update: (..._args: any[]) => chainable(() => mockDbUpdate()),
      insert: (..._args: any[]) => chainable(() => mockDbInsert()),
    },
    agentActionLogTable: { id: "id", userId: "userId" },
    agentConversationsTable: { id: "id", userId: "userId", role: "role", content: "content" },
    tasksTable: { id: "id", userId: "userId", title: "title", status: "status" },
    timeBlocksTable: { id: "id", userId: "userId", taskId: "taskId", startAt: "startAt", endAt: "endAt" },
    notificationSettingsTable: { userId: "userId", timeZone: "timeZone" },
    memoryFactsTable: { id: "id", userId: "userId", category: "category" },
    llmUsageTable: { id: "id", userId: "userId", costEstimateCents: "costEstimateCents" },
    llmCredentialsTable: { id: "id", userId: "userId", provider: "provider" },
    type: {} as any,
    Task: {} as any,
  };
});

import { runAgentConversation } from "./engine";

// ---------------------------------------------------------------------------
// Provider environment control.
//
// The provider list is resolved from the environment plus stored BYOK
// credentials. The stored credentials are empty here (the DB mock returns no
// rows), so the environment alone decides which providers exist. Every provider
// env key is cleared before each test so the suite cannot pick up a key from
// the machine it runs on.
// ---------------------------------------------------------------------------

const PROVIDER_ENV_KEYS = [
  "LITELLM_BASE_URL",
  "LITELLM_API_KEY",
  "LITELLM_MODEL",
  "GEMINI_API_KEY",
  "GEMINI_MODEL",
  "NVIDIA_NIM_API_KEY",
  "NVIDIA_NIM_MODEL",
  "GROQ_API_KEY",
  "GROQ_MODEL",
  "OPENROUTER_API_KEY",
  "OPENROUTER_MODEL",
];

const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  vi.clearAllMocks();
  mockDbSelect.mockResolvedValue([]);
  mockDbUpdate.mockResolvedValue([]);
  mockDbInsert.mockResolvedValue([]);

  for (const key of PROVIDER_ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of PROVIDER_ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("an agent reply carries its provenance", () => {
  it("says the local engine answered when no provider is configured", async () => {
    const result = await runAgentConversation({
      userId: "provenance-no-provider",
      message: "what is due today?",
    });

    expect(result.reply.length).toBeGreaterThan(0);
    expect(result.provider).toBe("local-fallback");
    expect(result.degraded).toBe(true);
  });

  it("says which provider answered, and is not degraded, when one does", async () => {
    process.env.GEMINI_API_KEY = "mock-gemini-key";

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              role: "assistant",
              content: "You have one task due today.",
            },
          },
        ],
        usage: { prompt_tokens: 30, completion_tokens: 12 },
      }),
    } as any);

    const result = await runAgentConversation({
      userId: "provenance-with-provider",
      message: "what is due today?",
    });

    expect(result.provider).toBe("gemini");
    expect(result.degraded).toBe(false);

    fetchSpy.mockRestore();
  });

  it("reports the local engine when every configured provider fails", async () => {
    process.env.GEMINI_API_KEY = "mock-gemini-key";

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("provider unreachable"),
    );

    const result = await runAgentConversation({
      userId: "provenance-provider-fails",
      message: "what is due today?",
    });

    expect(result.provider).toBe("local-fallback");
    expect(result.degraded).toBe(true);

    fetchSpy.mockRestore();
  });
});
