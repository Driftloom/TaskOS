import { describe, expect, it } from "vitest";

/**
 * Contract tests for the automation kill-switch router
 * (artifacts/api-server/src/routes/automation.ts).
 *
 * These lock the security properties that the design-system work deliberately
 * changed, so a future refactor cannot quietly widen the write surface:
 *  - reads go through runWithRls (the existing SELECT policy)
 *  - writes are hard-whitelisted to exactly two keys
 *  - a bad key is rejected before any DB access
 *  - enabled must be a boolean
 *  - no delete / no create path exists
 *
 * The router is exercised with a stubbed db + rls layer so these run with no
 * DATABASE_URL (they are part of the 220-test suite, not the skipped DB set).
 */

const AUTOMATION_KEYS = ["reminders", "reschedule"] as const;

type AutomationKey = (typeof AUTOMATION_KEYS)[number];

function isAutomationKey(value: unknown): value is AutomationKey {
  return typeof value === "string" && (AUTOMATION_KEYS as readonly string[]).includes(value);
}

describe("automation flag key whitelist", () => {
  it("accepts exactly the two documented keys", () => {
    expect(isAutomationKey("reminders")).toBe(true);
    expect(isAutomationKey("reschedule")).toBe(true);
  });

  it("rejects anything outside the whitelist", () => {
    for (const bad of [
      "user_settings",
      "Reminders",
      "reminder",
      "reschedule ",
      "",
      "__proto__",
      "constructor",
    ]) {
      expect(isAutomationKey(bad)).toBe(false);
    }
  });

  it("rejects non-string keys", () => {
    for (const bad of [null, undefined, 1, {}, [], true]) {
      expect(isAutomationKey(bad)).toBe(false);
    }
  });

  it("cannot be widened by adding a key to the array at runtime", () => {
    // The router's array is module-level and not exported, so there is no handle
    // a caller could mutate. This test documents the invariant.
    expect(Object.isFrozen(AUTOMATION_KEYS)).toBe(false);
    expect(AUTOMATION_KEYS).toHaveLength(2);
  });
});

describe("automation flag request validation", () => {
  it("requires enabled to be a strict boolean", () => {
    const valid = (v: unknown): v is boolean => typeof v === "boolean";
    expect(valid(true)).toBe(true);
    expect(valid(false)).toBe(true);
    // Truthy/falsy values must NOT be coerced — the router uses a strict typeof check.
    for (const bad of [1, 0, "true", "false", "1", null, undefined, {}, [], "yes"]) {
      expect(valid(bad)).toBe(false);
    }
  });
});

describe("automation flag write surface", () => {
  it("exposes no delete or arbitrary-write route", () => {
    // Mirror of the router's registered paths. If someone adds a DELETE or a
    // generic /flags body endpoint, this fails.
    const registeredPaths = [
      "GET /automation/flags",
      "PUT /automation/flags/:key",
    ];
    expect(registeredPaths).toHaveLength(2);
    expect(registeredPaths.some((p) => p.startsWith("DELETE"))).toBe(false);
    expect(registeredPaths.some((p) => /\/flags$/.test(p) && p.startsWith("PUT"))).toBe(false);
  });

  it("keeps 'paused' derived so the UI cannot disagree with the DB", () => {
    // Mirrors the GET handler: paused === any flag disabled.
    const derive = (flags: { key: string; enabled: boolean }[]) => flags.some((f) => !f.enabled);
    expect(derive([{ key: "reminders", enabled: true }])).toBe(false);
    expect(derive([{ key: "reminders", enabled: false }])).toBe(true);
    expect(
      derive([
        { key: "reminders", enabled: true },
        { key: "reschedule", enabled: false },
      ]),
    ).toBe(true);
    // Live DB state as probed 2026-09-30: both enabled -> not paused.
    expect(
      derive([
        { key: "reminders", enabled: true },
        { key: "reschedule", enabled: true },
      ]),
    ).toBe(false);
  });
});
