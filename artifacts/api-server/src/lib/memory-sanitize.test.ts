import { describe, it, expect } from "vitest";
import {
  sanitizeMemoryFact,
  sanitizeMemoryFacts,
  withoutSecrets,
} from "./memory-sanitize";

/**
 * These are the regression lock for a live exposure: `GET /memory/facts`
 * selected whole rows, so `telegram_config`'s `value.botToken` was returned to
 * the client in plaintext. If any of these pass while a secret is reachable,
 * the leak is back.
 */

describe("sanitizeMemoryFact", () => {
  it("drops value entirely for channel-category facts", () => {
    const result = sanitizeMemoryFact({
      id: 1,
      key: "telegram_config",
      category: "channel",
      title: "Telegram Integration Credentials",
      confidence: 100,
      value: { botToken: "7123456789:AAF-real-token", botUsername: "my_bot" },
    });

    expect(result).not.toHaveProperty("value");
    expect(JSON.stringify(result)).not.toContain("AAF-real-token");
    // Non-secret columns survive so the row is still identifiable in the UI.
    expect(result.key).toBe("telegram_config");
    expect(result.title).toBe("Telegram Integration Credentials");
  });

  it("keeps value for behavioural facts (the /memory page needs them)", () => {
    const result = sanitizeMemoryFact({
      id: 2,
      key: "procrastination_evening",
      category: "procrastination",
      value: { pattern: "avoids evening tasks", observedCount: 7 },
    });

    expect(result.value).toEqual({ pattern: "avoids evening tasks", observedCount: 7 });
  });

  it("strips secret-named keys from non-channel facts", () => {
    const result = sanitizeMemoryFact({
      id: 3,
      category: "custom",
      value: {
        note: "prefers mornings",
        apiKey: "sk-leak-me",
        accessToken: "at-leak-me",
        password: "hunter2",
        clientSecret: "cs-leak-me",
        ciphertext: "v1:abc",
        Authorization: "Bearer leak",
      },
    });

    expect(result.value).toEqual({ note: "prefers mornings" });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("leak-me");
    expect(serialized).not.toContain("hunter2");
    expect(serialized).not.toContain("v1:abc");
  });

  it("recurses into nested objects", () => {
    const result = sanitizeMemoryFact({
      id: 4,
      category: "custom",
      value: {
        integrations: {
          telegram: { botToken: "nested-secret", botId: 42 },
          slack: { ok: true },
        },
      },
    });

    expect(result.value).toEqual({
      integrations: {
        telegram: { botId: 42 },
        slack: { ok: true },
      },
    });
    expect(JSON.stringify(result)).not.toContain("nested-secret");
  });

  it("does not mutate the input row", () => {
    const input = {
      id: 5,
      category: "custom",
      value: { botToken: "keep-in-db", note: "x" },
    };
    sanitizeMemoryFact(input);
    // The server must still be able to read the real token.
    expect(input.value.botToken).toBe("keep-in-db");
  });

  it("leaves a null/undefined value alone", () => {
    expect(sanitizeMemoryFact({ id: 6, category: "custom", value: null }).value).toBeNull();
    expect(
      sanitizeMemoryFact({ id: 7, category: "custom" } as never),
    ).not.toHaveProperty("value");
  });

  it("tolerates non-object input without throwing", () => {
    expect(sanitizeMemoryFact(null as never)).toBeNull();
    expect(sanitizeMemoryFact(undefined as never)).toBeUndefined();
  });

  it("survives a depth-bomb value without hanging", () => {
    let deep: Record<string, unknown> = { note: "bottom" };
    for (let i = 0; i < 40; i++) deep = { nested: deep };
    expect(() => sanitizeMemoryFact({ id: 8, category: "custom", value: deep })).not.toThrow();
  });
});

describe("sanitizeMemoryFacts", () => {
  it("sanitizes every row in a mixed list", () => {
    const rows = sanitizeMemoryFacts([
      { id: 1, category: "channel", value: { botToken: "secret-a" } },
      { id: 2, category: "procrastination", value: { pattern: "fine" } },
      { id: 3, category: "custom", value: { apiKey: "secret-b", keep: 1 } },
    ]);

    expect(rows).toHaveLength(3);
    const serialized = JSON.stringify(rows);
    expect(serialized).not.toContain("secret-a");
    expect(serialized).not.toContain("secret-b");
    expect(rows[1].value).toEqual({ pattern: "fine" });
    expect(rows[2].value).toEqual({ keep: 1 });
  });

  it("returns an empty array for non-array input", () => {
    expect(sanitizeMemoryFacts(null as never)).toEqual([]);
  });
});

describe("withoutSecrets", () => {
  it("keeps the row shape and drops only secret keys", () => {
    const result = withoutSecrets({
      id: 9,
      category: "channel",
      value: { botToken: "x", botUsername: "my_bot" },
    });
    expect(result.value).toEqual({ botUsername: "my_bot" });
  });
});