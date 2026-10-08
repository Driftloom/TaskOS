import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";

/**
 * HTTP-level contract tests against the real Express app.
 *
 * The pure-unit suite under src/lib cannot catch a route that lost its
 * `requireAuth`, a missing 404 handler, or a CORS wildcard. These boot the
 * actual app and assert the security surface over real HTTP.
 *
 * Uses node:http + fetch rather than supertest so no new dependency is
 * introduced and the test exercises genuine socket behaviour.
 *
 * These cases are deliberately database-independent: they assert the
 * unauthenticated boundary, which must hold whether or not Postgres is up.
 */

let server: Server;
let baseUrl: string;

// The app refuses to boot on missing/malformed Clerk keys (see lib/clerk-key.ts),
// and clerkMiddleware validates them per request, so the test needs both in a
// valid format. Format only, no real credential: every assertion here is on the
// unauthenticated boundary, so no session is ever verified.
const VALID_PK = "pk_test_c21hcnQtd2Vhc2VsLTk5MDUuY2xlcmsuYWNjb3VudHMuZGV2JA";
const VALID_SK = "sk_test_c21hcnQtd2Vhc2VsLTk5MDUuY2xlcmsuYWNjb3VudHMuZGV2JA";

beforeAll(async () => {
  // lib/db throws at import time without DATABASE_URL. A syntactically valid
  // but unreachable value is enough: none of these tests touch the database,
  // and an accidental DB call will fail loudly rather than hang.
  process.env.DATABASE_URL ??=
    "postgresql://postgres:postgres@127.0.0.1:1/postgres?connect_timeout=1";
  process.env.CLERK_PUBLISHABLE_KEY ??= VALID_PK;
  process.env.CLERK_SECRET_KEY ??= VALID_SK;
  process.env.CORS_ORIGINS ??= "http://localhost:5173";
  process.env.NODE_ENV = "test";
  // These tests deliberately drive unauthenticated and unavailable-dependency
  // paths, so the request logger fills the output with 401/503 stack traces.
  process.env.LOG_LEVEL ??= "silent";

  const { default: app } = await import("../app");
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
}, 60_000);

afterAll(async () => {
  await new Promise<void>((resolve) => server?.close(() => resolve()));
}, 30_000);

/** Routes that must never answer an unauthenticated caller with 2xx. */
const PROTECTED_ROUTES: Array<[string, string]> = [
  ["GET", "/api/tasks"],
  ["POST", "/api/tasks"],
  ["GET", "/api/tasks/summary"],
  ["GET", "/api/momentum"],
  ["GET", "/api/blocks"],
  ["GET", "/api/projects"],
  ["GET", "/api/tags"],
  ["GET", "/api/focus-sessions"],
  ["GET", "/api/settings/notifications"],
  ["GET", "/api/settings/focus"],
  ["GET", "/api/reschedule/proposals"],
  ["GET", "/api/settings/rescheduling"],
  ["GET", "/api/memory/facts"],
  ["GET", "/api/memory/confirmations"],
  ["GET", "/api/agent/actions"],
  ["GET", "/api/agent/usage"],
  ["GET", "/api/rituals/plan-day"],
  ["GET", "/api/integrations/status"],
  ["GET", "/api/integrations/telegram/pairing-token"],
  ["POST", "/api/integrations/url-metadata"],
  ["GET", "/api/goals"],
  ["POST", "/api/goals"],
  ["GET", "/api/goals/baselines"],
  ["GET", "/api/goals/review"],
  ["GET", "/api/goals/history"],
];

describe("authentication boundary", () => {
  it("answers an unauthenticated request with 401 JSON on every protected route", async () => {
    const results = await Promise.all(
      PROTECTED_ROUTES.map(async ([method, path]) => {
        const res = await fetch(`${baseUrl}${path}`, { method });
        const body = await res.text();
        return { method, path, status: res.status, body };
      }),
    );

    const notUnauthorized = results.filter((r) => r.status !== 401);
    expect(
      notUnauthorized.map((r) => `${r.method} ${r.path} -> ${r.status}`),
      "a protected route answered an anonymous caller",
    ).toEqual([]);

    // The client parses JSON on non-2xx, so an HTML body would surface as a
    // confusing parse failure rather than a clean 401.
    const nonJson = results.filter((r) => {
      try {
        JSON.parse(r.body);
        return false;
      } catch {
        return true;
      }
    });
    expect(nonJson.map((r) => `${r.method} ${r.path}`)).toEqual([]);
  });

  it("rejects a tampered bearer token", async () => {
    const res = await fetch(`${baseUrl}/api/tasks`, {
      headers: { Authorization: "Bearer not.a.real.jwt" },
    });
    expect(res.status).toBe(401);
  });
});

describe("public surface", () => {
  it("serves healthz without credentials", async () => {
    const res = await fetch(`${baseUrl}/api/healthz`);
    expect([200, 503]).toContain(res.status);
    const body = (await res.json()) as { status: string; database: string };
    expect(["ok", "degraded"]).toContain(body.status);
    // Reports real reachability rather than a hardcoded "ok".
    expect(["up", "down"]).toContain(body.database);
  });

  it("returns a JSON 404 for an unknown api path", async () => {
    const res = await fetch(`${baseUrl}/api/definitely-not-a-route`);
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({ error: "Not found" });
  });
});

describe("internal job endpoints", () => {
  it.each([
    "/api/internal/dispatch",
    "/api/internal/reschedule",
    "/api/internal/memory-extraction",
    "/api/internal/recurrence-materialize",
  ])("refuses %s without the dispatch secret", async (path) => {
    const res = await fetch(`${baseUrl}${path}`, { method: "POST" });
    // 503 when DISPATCH_SECRET is unset, otherwise 401. Never 2xx.
    expect([401, 503]).toContain(res.status);
  });

  it("refuses the telegram webhook without its secret", async () => {
    const res = await fetch(`${baseUrl}/api/telegram/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ update_id: 1, message: { text: "hi" } }),
    });
    expect([401, 503]).toContain(res.status);
  });
});

describe("CORS", () => {
  it("does not reflect an unlisted origin", async () => {
    const res = await fetch(`${baseUrl}/api/healthz`, {
      headers: { Origin: "https://evil.example" },
    });
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("allows the configured origin", async () => {
    const res = await fetch(`${baseUrl}/api/healthz`, {
      headers: { Origin: "http://localhost:5173" },
    });
    expect(res.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:5173",
    );
  });
});
