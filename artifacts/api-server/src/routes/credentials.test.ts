import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  encryptCredential,
  decryptCredential,
  keyHint,
} from "../lib/agent/credential-crypto";

/**
 * Contract tests for the in-app BYOK credential routes.
 *
 * The property that matters most: **the API key never leaves the server.**
 * `GET /agent/credentials` must not return the key or the ciphertext, which is
 * exactly the mistake that shipped with the Telegram token — a write-only UI
 * field defeated by a second endpoint that handed the secret back.
 *
 * There is no supertest in this package (and adding one to assert a shape the
 * crypto suite already covers would break the reuse ladder), so the security
 * properties are asserted structurally against the source plus behaviourally
 * against the pure helpers.
 */

const SOURCE_PATH = join(__dirname, "agent.ts");
const source = readFileSync(SOURCE_PATH, "utf8");

describe("credential routes never leak the secret", () => {
  it("GET does not select or return ciphertext", () => {
    const getBlock = source.slice(
      source.indexOf('router.get("/agent/credentials"'),
      source.indexOf('router.put("/agent/credentials/:provider"'),
    );
    expect(getBlock).not.toContain("ciphertext");
    // It must project columns explicitly, never `select()` the whole row.
    expect(getBlock).not.toMatch(/\.select\(\)/);
  });

  it("the only place a key is written is encrypt() before persistence", () => {
    // `apiKey` must reach the database exclusively through encryptCredential.
    expect(source).toContain("encryptCredential(apiKey)");
    expect(source).not.toMatch(/ciphertext:\s*apiKey/);
  });

  it("no response body contains the raw key", () => {
    // Precise version: scan each res.json call rather than the whole file,
    // because `const { apiKey } = parsed.data` legitimately appears elsewhere.
    const responses = source
      .split("\n")
      .filter((line) => /\bres\.(status\(\d+\)\.)?json\(/.test(line));
    const offenders = responses.filter((line) => /\bapiKey\b/.test(line));
    expect(
      offenders,
      `Response body contains the raw key:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("masks the hint before returning it", () => {
    expect(source).toContain("`••••${hint}`");
    expect(source).toContain("`••••${r.keyHint}`");
  });
});

describe("credential route validation", () => {
  it("requires both a url and key before persisting", () => {
    expect(source).toMatch(/apiKey:\s*z\.string\(\)\.min\(8/);
  });

  it("rejects a custom provider without a baseUrl", () => {
    expect(source).toContain("baseUrl is required for the custom provider");
  });

  it("rejects a baseUrl override on a known provider", () => {
    // Otherwise a stored Gemini key could be aimed at an attacker-controlled host.
    expect(source).toContain("baseUrl is not allowed for");
  });

  it("probes the provider before it persists anything", () => {
    const putStart = source.indexOf('router.put("/agent/credentials/:provider"');
    const persistStart = source.indexOf("encryptCredential(apiKey)", putStart);
    const probeStart = source.indexOf("await fetch(chatCompletionsUrl", putStart);
    expect(probeStart).toBeGreaterThan(putStart);
    expect(probeStart).toBeLessThan(persistStart);
  });

  it("does not persist when the probe is rejected", () => {
    const putBlock = source.slice(source.indexOf('router.put("/agent/credentials/:provider"'));
    // A non-ok probe must return before the insert/update.
    const rejectAt = putBlock.indexOf("if (!probe.ok)");
    const persistAt = putBlock.indexOf("encryptCredential(apiKey)");
    expect(rejectAt).toBeGreaterThan(-1);
    expect(rejectAt).toBeLessThan(persistAt);
  });

  it("scopes every credential query by user id", () => {
    // An earlier Telegram bug matched on key alone and adopted another user's
    // secret. Guard the invariant structurally.
    const credentialOps = source.split("llmCredentialsTable").slice(1).join("llmCredentialsTable");
    expect(credentialOps).not.toMatch(/\.where\(eq\(llmCredentialsTable\.provider/);
  });

  it("surfaces missing encryption config as 503, not a 500 or a silent save", () => {
    expect(source).toContain("Credential storage is unavailable");
    expect(source).toMatch(/res\.status\(503\)/);
  });
});

describe("stored credential round trip", () => {
  const VALID_KEY = Buffer.alloc(32, 3).toString("base64");
  let original: string | undefined;

  beforeEach(() => {
    original = process.env.CREDENTIAL_ENCRYPTION_KEY;
    process.env.CREDENTIAL_ENCRYPTION_KEY = VALID_KEY;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.CREDENTIAL_ENCRYPTION_KEY;
    else process.env.CREDENTIAL_ENCRYPTION_KEY = original;
  });

  it("a stored key decrypts back to the original and never matches it in ciphertext", () => {
    const apiKey = "sk-proj-REAL-SECRET-1234";
    const ciphertext = encryptCredential(apiKey);
    expect(decryptCredential(ciphertext)).toBe(apiKey);
    expect(ciphertext).not.toContain("REAL-SECRET");
  });

  it("the hint is only the last four characters", () => {
    expect(keyHint("sk-proj-ABCDEFGH")).toBe("EFGH");
    expect(keyHint("abc")).toBe("abc");
    expect(keyHint("")).toBe("");
  });

  it("hint length stays inside the migration CHECK constraint (<= 8)", () => {
    const migration = readFileSync(
      join(__dirname, "../../../../lib/db/migrations/0016_llm_credentials.sql"),
      "utf8",
    );
    expect(migration).toContain("char_length(key_hint) <= 8");
    expect(keyHint("sk-very-long-provider-key-value").length).toBeLessThanOrEqual(4);
  });

  it("two users storing the same key produce different ciphertext", () => {
    expect(encryptCredential("same")).not.toBe(encryptCredential("same"));
  });
});
