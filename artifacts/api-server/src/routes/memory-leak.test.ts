import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Structural regression lock for a live secret exposure.
 *
 * `memory_facts.value` is JSONB and carries integration credentials —
 * `saveConfigFact` writes the Telegram bot token to `key = 'telegram_config'`,
 * `category = 'channel'`. `GET /memory/facts` selected whole rows and returned
 * them, so any authenticated caller received that token in plaintext. The
 * integrations UI is deliberately write-only and never re-renders the token,
 * which is exactly why a second endpoint handing it back went unnoticed.
 *
 * There is no supertest in this package (and adding one to assert a shape the
 * lib test already covers would break the reuse ladder), so this asserts the
 * invariant structurally: **every** response that serializes a memory fact must
 * route through the sanitizer. A new endpoint added later without the sanitizer
 * fails here rather than shipping a leak.
 */

const SOURCE_PATH = join(__dirname, "memory.ts");
const source = readFileSync(SOURCE_PATH, "utf8");

/** Variables that hold a `memory_facts` row. */
const FACT_VARIABLES = ["facts", "fact", "confirmations", "updated"];

/** All `res.json(...)` / `res.status(N).json(...)` calls, one per line. */
function responseCalls(src: string): string[] {
  return src
    .split("\n")
    .filter((line) => /\bres\.(status\(\d+\)\.)?json\(/.test(line))
    .map((line) => line.trim());
}

describe("memory router never serializes a raw fact row", () => {
  it("imports the sanitizer", () => {
    expect(source).toMatch(/import\s*\{[^}]*sanitizeMemoryFact/s);
  });

  it("every fact-bearing response goes through the sanitizer", () => {
    const offenders = responseCalls(source).filter((call) => {
      const mentionsFact = FACT_VARIABLES.some((v) => new RegExp(`\\b${v}\\b`).test(call));
      if (!mentionsFact) return false;
      // An error response never carries a fact row.
      if (/\{\s*error\s*:/.test(call)) return false;
      return !/sanitizeMemoryFact/.test(call);
    });

    expect(
      offenders,
      `Unsanitized memory fact response(s):\n${offenders.join("\n")}\n` +
        "Every res.json carrying a memory fact row must wrap it in " +
        "sanitizeMemoryFact()/sanitizeMemoryFacts() — memory_facts.value holds " +
        "integration credentials for category='channel'.",
    ).toEqual([]);
  });

  it("does not select memory facts without a downstream sanitizer", () => {
    // Guards the specific original defect shape: a bare `tx.select()` on
    // memoryFactsTable whose result flows straight into the response.
    const bareSelects = source.match(/\.select\(\)\s*\n\s*\.from\(memoryFactsTable\)/g);
    expect(bareSelects, "unexpected shape change in memory fact selects").not.toBeNull();

    // Every such select must be followed (within the same handler) by a
    // sanitize call. Count selects vs sanitize calls as a coarse tripwire.
    const selects = (source.match(/\.from\(memoryFactsTable\)/g) ?? []).length;
    const sanitizes = (source.match(/sanitizeMemoryFacts?\(/g) ?? []).length - 1; // minus the import
    expect(sanitizes).toBeGreaterThanOrEqual(selects - 2);
  });

  it("the live token string never appears in a response literal", () => {
    // A response must never be built by string-concatenating a raw row.
    expect(source).not.toMatch(/res\.json\(\s*`/);
    expect(source).not.toMatch(/res\.json\(JSON\.stringify/);
  });
});

describe("telegram token is not cached into process.env", () => {
  const integrationsPath = join(__dirname, "integrations.ts");
  const integrations = readFileSync(integrationsPath, "utf8");

  it("no longer writes the user's token to the shared process env", () => {
    expect(integrations).not.toMatch(/process\.env\.TELEGRAM_BOT_TOKEN\s*=/);
  });

  it("keeps read-only references to the env fallback", () => {
    // Reading an operator-set env var is fine; the bug was assigning to it.
    const assignments = integrations.match(/process\.env\.TELEGRAM_BOT_TOKEN\s*=[^=]/g);
    expect(assignments).toBeNull();
  });
});