process.env.DATABASE_URL ??=
  "postgresql://postgres:postgres@127.0.0.1:1/postgres?connect_timeout=1";

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getVapidPublicKey } from "../lib/web-push";

const INTEGRATIONS_PATH = join(__dirname, "integrations.ts");
const integrationsSource = readFileSync(INTEGRATIONS_PATH, "utf8");

describe("Web Push routes & RFC 8291 contracts", () => {
  it("VAPID public key helper returns a valid base64url string", () => {
    const key = getVapidPublicKey();
    expect(key).toBeDefined();
    expect(key.length).toBeGreaterThan(40);
    expect(key).toMatch(/^[A-Za-z0-9_-]+$/);
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
    expect(integrationsSource).toContain('router.post("/integrations/push/unsubscribe", requireAuth');
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
