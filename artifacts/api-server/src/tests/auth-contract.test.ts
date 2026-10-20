import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import { performance } from "node:perf_hooks";

/**
 * End-to-End Authentication & Authorization Contract Tests for Cadence API.
 * 
 * Verifies:
 * - AUT-01: Fail-closed 401 JSON response on protected endpoints.
 * - AUT-02: Resilience against malformed, truncated, corrupted, and invalid token schemes.
 * - AUT-03 / TC-PRF-04: Auth rejection latency SLA (median <= 50ms).
 * - Public endpoint verification (/api/healthz).
 */

let server: Server;
let baseUrl: string;

const VALID_PK = "pk_test_ZXhhbXBsZS5jbGVyay5hY2NvdW50cy5kZXYk";
const VALID_SK = "sk_test_ZXhhbXBsZS5jbGVyay5hY2NvdW50cy5kZXYk";

beforeAll(async () => {
  process.env.DATABASE_URL ??=
    "postgresql://postgres:postgres@127.0.0.1:1/postgres?connect_timeout=1";
  process.env.CLERK_PUBLISHABLE_KEY ??= VALID_PK;
  process.env.CLERK_SECRET_KEY ??= VALID_SK;
  process.env.CORS_ORIGINS ??= "http://localhost:5173";
  process.env.NODE_ENV = "test";
  process.env.LOG_LEVEL ??= "silent";

  const { default: app } = await import("../app");
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
}, 120_000);

afterAll(async () => {
  await new Promise<void>((resolve) => server?.close(() => resolve()));
}, 30_000);

describe("AUT-01: Protected Route Authentication Boundary", () => {
  it("rejects unauthenticated requests with HTTP 401 JSON and proper error structure", async () => {
    const res = await fetch(`${baseUrl}/api/tasks`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    const body = await res.json();
    expect(body).toEqual({ error: "Unauthorized" });
  });

  it("permits public unauthenticated access to /api/healthz (returns 200 or 503 depending on DB, never 401)", async () => {
    const res = await fetch(`${baseUrl}/api/healthz`);
    expect(res.status).not.toBe(401);
    expect([200, 503]).toContain(res.status);
    const body = await res.json();
    expect(["ok", "degraded"]).toContain(body.status);
  });
});

describe("AUT-02: Corrupted, Malformed & Non-Bearer Token Resilience", () => {
  const malformedHeaderCases = [
    { name: "empty Bearer token", header: "Bearer " },
    { name: "single word not a JWT", header: "Bearer not_a_jwt" },
    { name: "two-part token missing signature", header: "Bearer part1.part2" },
    { name: "four-part token invalid format", header: "Bearer one.two.three.four" },
    { name: "non-base64 characters in body", header: "Bearer header.!!!not_base64!!!.sig" },
    { name: "Basic auth scheme instead of Bearer", header: "Basic dXNlcjpwYXNz" },
    { name: "Raw string without scheme", header: "SomeRandomToken" },
    { name: "Extremely large header (>4KB payload)", header: `Bearer ${"a".repeat(4500)}` },
  ];

  for (const tc of malformedHeaderCases) {
    it(`fails closed with 401 JSON when sent ${tc.name}`, async () => {
      const res = await fetch(`${baseUrl}/api/tasks`, {
        method: "GET",
        headers: {
          Authorization: tc.header,
          Accept: "application/json",
        },
      });

      expect(res.status, `Failed closed expectation for ${tc.name}`).toBe(401);
      const contentType = res.headers.get("content-type") || "";
      expect(contentType).toMatch(/application\/json/);
      const body = await res.json();
      expect(body.error).toBe("Unauthorized");
    });
  }
});

describe("AUT-03 / TC-PRF-04: Auth Rejection Latency SLA", () => {
  it("rejects unauthorized requests with median latency <= 50ms", async () => {
    const iterations = 10;
    const latencies: number[] = [];

    // Warm-up request
    await fetch(`${baseUrl}/api/tasks`);

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      const res = await fetch(`${baseUrl}/api/tasks`, {
        headers: { Accept: "application/json" },
      });
      const elapsed = performance.now() - start;
      latencies.push(elapsed);
      expect(res.status).toBe(401);
    }

    latencies.sort((a, b) => a - b);
    const median = latencies[Math.floor(latencies.length / 2)];

    expect(
      median,
      `Median auth rejection latency was ${median.toFixed(2)}ms (must be <= 50ms)`,
    ).toBeLessThanOrEqual(50);
  });
});
