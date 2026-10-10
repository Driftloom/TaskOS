import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";

const mockGetAuth = vi.fn();

vi.mock("@clerk/express", () => ({
  getAuth: (req: Request) => mockGetAuth(req),
}));

import { requireAuth } from "./auth";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockReq(): Request {
  return {} as unknown as Request;
}

function createMockRes(): { res: Response; statusFn: any; jsonFn: any } {
  const jsonFn = vi.fn();
  const statusFn = vi.fn().mockReturnValue({ json: jsonFn });
  const res = {
    status: statusFn,
    json: jsonFn,
  } as unknown as Response;
  return { res, statusFn, jsonFn };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("requireAuth middleware", () => {
  beforeEach(() => {
    mockGetAuth.mockReset();
  });

  // TC-MID-01
  it("rejects unauthenticated requests with HTTP 401 JSON", async () => {
    mockGetAuth.mockReturnValue({ userId: null });
    const req = createMockReq();
    const { res, statusFn, jsonFn } = createMockRes();
    const next = vi.fn();

    await requireAuth(req, res, next);

    expect(statusFn).toHaveBeenCalledWith(401);
    expect(jsonFn).toHaveBeenCalledWith({ error: "Unauthorized" });
    expect(next).not.toHaveBeenCalled();
  });

  // TC-MID-02
  it("does not call next() when userId is undefined", async () => {
    mockGetAuth.mockReturnValue({});
    const req = createMockReq();
    const { res, statusFn } = createMockRes();
    const next = vi.fn();

    await requireAuth(req, res, next);

    expect(statusFn).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  // TC-MID-03
  it("populates req.userId and req.authToken, then calls next() for valid sessions", async () => {
    const fakeToken = "header.payload.signature";
    mockGetAuth.mockReturnValue({
      userId: "user_2enterprise",
      getToken: vi.fn().mockResolvedValue(fakeToken),
    });

    const req = createMockReq();
    const { res } = createMockRes();
    const next = vi.fn();

    await requireAuth(req, res, next);

    expect(req.userId).toBe("user_2enterprise");
    expect(req.authToken).toBe(fakeToken);
    expect(next).toHaveBeenCalledTimes(1);
  });

  // TC-MID-04
  it("gracefully sets authToken to undefined and calls next() if getToken() rejects", async () => {
    mockGetAuth.mockReturnValue({
      userId: "user_resilient",
      getToken: vi.fn().mockRejectedValue(new Error("Clerk auth service timeout")),
    });

    const req = createMockReq();
    const { res } = createMockRes();
    const next = vi.fn();

    await requireAuth(req, res, next);

    expect(req.userId).toBe("user_resilient");
    // Fail-closed guarantee for runWithRls
    expect(req.authToken).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
  });

  // TC-MID-05
  it("handles getToken() resolving to null without crashing", async () => {
    mockGetAuth.mockReturnValue({
      userId: "user_null_token",
      getToken: vi.fn().mockResolvedValue(null),
    });

    const req = createMockReq();
    const { res } = createMockRes();
    const next = vi.fn();

    await requireAuth(req, res, next);

    expect(req.userId).toBe("user_null_token");
    expect(req.authToken).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
  });
});
