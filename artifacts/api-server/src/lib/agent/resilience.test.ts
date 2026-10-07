import { describe, it, expect, vi } from "vitest";
import {
  BreakerRegistry,
  CircuitBreaker,
  backoffDelay,
  classifyFailure,
  isRetryable,
  parseRetryAfter,
  retryWithBackoff,
} from "./resilience";

/**
 * Retry, fallback and breaker semantics.
 *
 * The rule under test throughout: **retry wraps the model HTTP call only, never
 * `executeAgentTool`**. Retrying a tool call after a timeout duplicates side
 * effects — that is why `engine-tools.test.ts` asserts `agent_action_log` row
 * counts and not success booleans.
 */

function httpError(status: number, extra: Record<string, unknown> = {}): Error {
  return Object.assign(new Error(`http ${status}`), { status, ...extra });
}

describe("classifyFailure", () => {
  it("maps statuses onto failure kinds", () => {
    expect(classifyFailure(httpError(401))).toBe("auth");
    expect(classifyFailure(httpError(403))).toBe("auth");
    expect(classifyFailure(httpError(429))).toBe("rate_limit");
    expect(classifyFailure(httpError(500))).toBe("server");
    expect(classifyFailure(httpError(502))).toBe("server");
    expect(classifyFailure(httpError(503))).toBe("server");
    expect(classifyFailure(httpError(400))).toBe("bad_request");
    expect(classifyFailure(httpError(404))).toBe("bad_request");
  });

  it("recognises a client-side abort as a timeout", () => {
    const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
    expect(classifyFailure(abort)).toBe("timeout");
  });

  it("treats fetch's TypeError as a network failure", () => {
    expect(classifyFailure(new TypeError("fetch failed"))).toBe("network");
  });

  it("recognises socket error codes", () => {
    for (const code of ["ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "ECONNREFUSED"]) {
      expect(classifyFailure(Object.assign(new Error(code), { code }))).toBe("network");
    }
  });
});

describe("isRetryable", () => {
  it("retries only transient failures", () => {
    expect(isRetryable("rate_limit")).toBe(true);
    expect(isRetryable("timeout")).toBe(true);
    expect(isRetryable("server")).toBe(true);
    expect(isRetryable("network")).toBe(true);
  });

  it("never retries a 4xx — a rejected key is rejected identically on attempt 2", () => {
    expect(isRetryable("auth")).toBe(false);
    expect(isRetryable("bad_request")).toBe(false);
  });
});

describe("parseRetryAfter", () => {
  it("parses delta-seconds", () => {
    expect(parseRetryAfter("5")).toBe(5000);
    expect(parseRetryAfter("0")).toBe(0);
  });

  it("parses an HTTP date", () => {
    const now = Date.parse("2026-01-01T00:00:00Z");
    expect(parseRetryAfter(new Date(now + 10_000).toUTCString(), now)).toBe(10_000);
  });

  it("caps at 60s so a hostile header cannot stall a request", () => {
    expect(parseRetryAfter("99999")).toBe(60_000);
  });

  it("returns undefined for junk", () => {
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter("soon")).toBeUndefined();
  });

  it("clamps a past date to zero", () => {
    const now = Date.parse("2026-01-01T00:00:00Z");
    expect(parseRetryAfter(new Date(now - 60_000).toUTCString(), now)).toBe(0);
  });
});

describe("backoffDelay", () => {
  it("grows with the attempt number", () => {
    const random = () => 1; // always the ceiling
    expect(backoffDelay(0, 100, 8000, random)).toBe(100);
    expect(backoffDelay(1, 100, 8000, random)).toBe(200);
    expect(backoffDelay(2, 100, 8000, random)).toBe(400);
  });

  it("caps instead of growing without bound", () => {
    const random = () => 1;
    expect(backoffDelay(20, 100, 8000, random)).toBe(8000);
  });

  it("jitters below the ceiling", () => {
    // Full jitter is what stops every client retrying in lockstep.
    expect(backoffDelay(5, 100, 8000, () => 0)).toBe(0);
    expect(backoffDelay(5, 100, 8000, () => 0.5)).toBeLessThan(3200);
  });
});

describe("retryWithBackoff", () => {
  const noSleep = async () => {};

  it("returns the value on first success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await retryWithBackoff(fn, { sleep: noSleep });
    expect(result.value).toBe("ok");
    expect(result.attempts).toBe(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries a 500 and succeeds on the third attempt", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(httpError(500))
      .mockRejectedValueOnce(httpError(503))
      .mockResolvedValue("recovered");

    const result = await retryWithBackoff(fn, { sleep: noSleep });
    expect(result.value).toBe("recovered");
    expect(result.attempts).toBe(3);
  });

  it("retries a 429 and a network failure", async () => {
    const rateLimited = await retryWithBackoff(
      vi.fn().mockRejectedValueOnce(httpError(429)).mockResolvedValue("ok"),
      { sleep: noSleep },
    );
    expect(rateLimited.value).toBe("ok");

    const netFailed = await retryWithBackoff(
      vi.fn().mockRejectedValueOnce(new TypeError("fetch failed")).mockResolvedValue("ok"),
      { sleep: noSleep },
    );
    expect(netFailed.value).toBe("ok");
  });

  it("does NOT retry a 401", async () => {
    const fn = vi.fn().mockRejectedValue(httpError(401));
    const result = await retryWithBackoff(fn, { sleep: noSleep });

    expect(result.kind).toBe("auth");
    expect(result.attempts).toBe(1);
    // One call only — retrying a rejected key just burns latency.
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry a 400", async () => {
    const fn = vi.fn().mockRejectedValue(httpError(400));
    const result = await retryWithBackoff(fn, { sleep: noSleep });
    expect(result.kind).toBe("bad_request");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("gives up after maxAttempts and reports the kind", async () => {
    const fn = vi.fn().mockRejectedValue(httpError(503));
    const result = await retryWithBackoff(fn, { maxAttempts: 3, sleep: noSleep });

    expect(result.value).toBeUndefined();
    expect(result.kind).toBe("server");
    expect(result.attempts).toBe(3);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("honours Retry-After over computed backoff", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fn = vi
      .fn()
      .mockRejectedValueOnce(httpError(429, { retryAfterMs: 1234 }))
      .mockResolvedValue("ok");

    await retryWithBackoff(fn, { sleep });
    expect(sleep).toHaveBeenCalledWith(1234, undefined);
  });

  it("stops when the abort signal fires", async () => {
    const controller = new AbortController();
    const fn = vi.fn().mockImplementation(async () => {
      controller.abort();
      throw httpError(500);
    });

    await expect(
      retryWithBackoff(fn, { sleep: async (_ms, signal) => {
        if (signal?.aborted) throw new Error("Aborted");
      }, signal: controller.signal }),
    ).rejects.toThrow("Aborted");
  });
});

describe("CircuitBreaker", () => {
  function makeBreaker(now: () => number, overrides = {}) {
    return new CircuitBreaker({ failureThreshold: 3, cooldownMs: 1000, now, ...overrides });
  }

  it("starts closed and allows calls", () => {
    const breaker = makeBreaker(() => 0);
    expect(breaker.state()).toBe("closed");
    expect(breaker.canAttempt()).toBe(true);
  });

  it("trips open at the failure threshold", () => {
    let t = 0;
    const breaker = makeBreaker(() => t);

    breaker.onFailure();
    breaker.onFailure();
    expect(breaker.state()).toBe("closed");
    breaker.onFailure();

    expect(breaker.state()).toBe("open");
    expect(breaker.canAttempt()).toBe(false);
  });

  it("fails fast while open rather than piling onto a dead dependency", () => {
    let t = 0;
    const breaker = makeBreaker(() => t);
    for (let i = 0; i < 3; i++) breaker.onFailure();

    expect(breaker.canAttempt()).toBe(false);
    // Time passing alone does not admit calls.
    t = 500;
    expect(breaker.canAttempt()).toBe(false);
  });

  it("moves to half-open after the cooldown", () => {
    let t = 0;
    const breaker = makeBreaker(() => t);
    for (let i = 0; i < 3; i++) breaker.onFailure();

    t = 1000;
    expect(breaker.state()).toBe("half_open");
    expect(breaker.canAttempt()).toBe(true);
  });

  it("limits probes while half-open", () => {
    let t = 0;
    const breaker = makeBreaker(() => t, { halfOpenProbes: 2 });
    for (let i = 0; i < 3; i++) breaker.onFailure();
    t = 1000;

    breaker.beginAttempt();
    breaker.beginAttempt();
    expect(breaker.canAttempt()).toBe(false);
  });

  it("closes on a successful probe and resets the counter", () => {
    let t = 0;
    const breaker = makeBreaker(() => t);
    for (let i = 0; i < 3; i++) breaker.onFailure();
    t = 1000;

    breaker.onSuccess();
    expect(breaker.state()).toBe("closed");
    // The next outage counts from zero, not from where it left off.
    expect(breaker.snapshot().failures).toBe(0);
  });

  it("re-opens immediately when a probe fails", () => {
    let t = 0;
    const breaker = makeBreaker(() => t);
    for (let i = 0; i < 3; i++) breaker.onFailure();
    t = 1000;
    expect(breaker.state()).toBe("half_open");

    breaker.onFailure();
    expect(breaker.state()).toBe("open");
    expect(breaker.canAttempt()).toBe(false);
  });

  it("a single success mid-streak resets the failure count", () => {
    let t = 0;
    const breaker = makeBreaker(() => t);
    breaker.onFailure();
    breaker.onFailure();
    breaker.onSuccess();
    breaker.onFailure();
    breaker.onFailure();
    expect(breaker.state()).toBe("closed");
  });
});

describe("BreakerRegistry", () => {
  it("keeps one breaker per provider", () => {
    const registry = new BreakerRegistry({ failureThreshold: 1, cooldownMs: 10 });
    const a = registry.forProvider("gemini");
    const b = registry.forProvider("groq");

    a.onFailure();
    // A dead Gemini key must not stop Groq from serving traffic.
    expect(a.state()).toBe("open");
    expect(b.state()).toBe("closed");

    expect(registry.forProvider("gemini")).toBe(a);
    expect(Object.keys(registry.snapshots()).sort()).toEqual(["gemini", "groq"]);
  });

  it("reset clears every breaker", () => {
    const registry = new BreakerRegistry({ failureThreshold: 1 });
    registry.forProvider("gemini").onFailure();
    registry.reset();
    expect(registry.snapshots()).toEqual({});
  });
});