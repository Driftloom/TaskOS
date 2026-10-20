process.env.DATABASE_URL ??=
  "postgresql://postgres:postgres@127.0.0.1:1/postgres?connect_timeout=1";

import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getVapidPublicKey, sendWebPush } from "../lib/web-push";

const INTEGRATIONS_PATH = join(__dirname, "integrations.ts");
const integrationsSource = readFileSync(INTEGRATIONS_PATH, "utf8");
const INTERNAL_PATH = join(__dirname, "internal.ts");
const internalSource = readFileSync(INTERNAL_PATH, "utf8");

// Public web-push-codelab example keys, used strictly as a test fixture so
// `webpush.setVapidDetails` accepts them. Source code must never fall back
// to these — that was the defect this suite guards against.
const FIXTURE_VAPID_PUBLIC =
  "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U";
const FIXTURE_VAPID_PRIVATE = "UUxI1xCe1MBKMprNy92Z22E1feCXPvEuNx8Da3JyTdQ";

const VAPID_ENV_KEYS = ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"] as const;

function setVapidEnv(): void {
  process.env.VAPID_PUBLIC_KEY = FIXTURE_VAPID_PUBLIC;
  process.env.VAPID_PRIVATE_KEY = FIXTURE_VAPID_PRIVATE;
  process.env.VAPID_SUBJECT = "mailto:test@example.com";
}

afterEach(() => {
  for (const key of VAPID_ENV_KEYS) {
    delete process.env[key];
  }
});

describe("Web Push routes & RFC 8291 contracts", () => {
  it("VAPID public key helper returns the configured base64url string", () => {
    setVapidEnv();
    const key = getVapidPublicKey();
    expect(key).toBe(FIXTURE_VAPID_PUBLIC);
    expect(key.length).toBeGreaterThan(40);
    expect(key).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("returns an empty key when VAPID env vars are unset (no example-key fallback)", () => {
    for (const key of VAPID_ENV_KEYS) {
      delete process.env[key];
    }
    expect(getVapidPublicKey()).toBe("");
  });

  it("sendWebPush degrades to a not-ok result when unconfigured", async () => {
    for (const key of VAPID_ENV_KEYS) {
      delete process.env[key];
    }
    const result = await sendWebPush(
      { endpoint: "https://push.example.invalid/subscribe", p256dh: "k", auth: "a" },
      { title: "Test", body: "Test body" },
    );
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Web Push not configured");
    expect(result.isExpired).toBeUndefined();
  });

  it("healthchecks/save no longer writes per-user URLs into process.env", () => {
    expect(integrationsSource).not.toContain("process.env.HEALTHCHECKS_DISPATCH_PING_URL =");
    expect(integrationsSource).not.toContain("process.env.HEALTHCHECKS_RESCHEDULE_PING_URL =");
  });

  it("internal sweep resolves user config first, operator env fallback second", () => {
    expect(internalSource).toContain(
      "val?.dispatchPingUrl || process.env.HEALTHCHECKS_DISPATCH_PING_URL",
    );
    expect(internalSource).toContain(
      "val?.reschedulePingUrl || process.env.HEALTHCHECKS_RESCHEDULE_PING_URL",
    );
  });

  it("GET /integrations/push/vapid-key is mounted with requireAuth", () => {
    expect(integrationsSource).toContain('router.get("/integrations/push/vapid-key", requireAuth');
  });

  it("POST /integrations/push/subscribe validates payload and scopes write with runWithRls", () => {
    expect(integrationsSource).toContain('router.post("/integrations/push/subscribe", requireAuth');
    expect(integrationsSource).toContain("SubscribePushNotificationsBody.safeParse");
    expect(integrationsSource).toContain("runWithRls(req,");
    expect(integrationsSource).toContain("webPushSubscriptionsTable.userId, userId");
  });

  it("POST /integrations/push/unsubscribe validates payload and scopes delete with runWithRls", () => {
    expect(integrationsSource).toContain(
      'router.post("/integrations/push/unsubscribe", requireAuth',
    );
    expect(integrationsSource).toContain("UnsubscribePushNotificationsBody.safeParse");
    expect(integrationsSource).toContain("runWithRls(req,");
    expect(integrationsSource).toContain("webPushSubscriptionsTable.userId, userId");
  });

  it("POST /integrations/push/test is protected and dispatches push to user", () => {
    expect(integrationsSource).toContain('router.post("/integrations/push/test", requireAuth');
    expect(integrationsSource).toContain("dispatchPushToUser(userId,");
  });

  it("GET /integrations/status includes push device count and enabled flag", () => {
    expect(integrationsSource).toContain("webPushSubscriptionsTable");
    expect(integrationsSource).toContain("push: {");
    expect(integrationsSource).toContain("deviceCount: pushDeviceCount");
  });
});
