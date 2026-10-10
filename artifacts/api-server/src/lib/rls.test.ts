import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request } from "express";

/**
 * Mock @workspace/db so we can capture every SQL statement that runWithRls
 * executes inside the transaction, without touching a real database.
 */
const executedStatements: any[] = [];
const mockTx = {
  execute: vi.fn(async (stmt: unknown) => {
    executedStatements.push(stmt);
  }),
};

vi.mock("@workspace/db", () => ({
  db: {
    transaction: vi.fn(async (fn: Function) => fn(mockTx)),
  },
}));

import { runWithRls } from "./rls";
import { db } from "@workspace/db";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal Express-shaped Request with an optional authToken. */
function fakeReq(authToken?: string): Request {
  return { authToken } as unknown as Request;
}

/**
 * Create a valid three-part JWT whose payload is the given object.
 * Header and signature are opaque - only the payload matters here.
 */
function makeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = "fake-sig";
  return `${header}.${body}.${signature}`;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runWithRls", () => {
  beforeEach(() => {
    executedStatements.length = 0;
    mockTx.execute.mockClear();
    vi.mocked(db.transaction).mockClear();
  });

  // TC-RLS-01
  it("extracts claims from a valid JWT and passes them to set_config", async () => {
    const payload = { sub: "user_123", role: "authenticated" };
    const token = makeJwt(payload);

    await runWithRls(fakeReq(token), async () => "ok");

    // First tx.execute call is the set_config statement
    const setConfigCall = mockTx.execute.mock.calls[0]![0] as any;
    expect(setConfigCall).toBeDefined();
    // The drizzle `sql` template literal stores the interpolated claims in queryChunks
    const claimsChunk = setConfigCall.queryChunks?.find(
      (chunk: any) => typeof chunk === "string" && chunk.includes('"sub"'),
    );
    expect(claimsChunk).toBe(JSON.stringify(payload));
  });

  // TC-RLS-02
  it("throws on a malformed token that does not have three parts", async () => {
    await expect(
      runWithRls(fakeReq("only.two"), async () => "ok"),
    ).rejects.toThrow("Malformed session token");

    await expect(
      runWithRls(fakeReq("one.two.three.four"), async () => "ok"),
    ).rejects.toThrow("Malformed session token");

    await expect(
      runWithRls(fakeReq("header..sig"), async () => "ok"),
    ).rejects.toThrow("Malformed session token");
  });

  // TC-RLS-03
  it("handles non-matching / corrupted payload without crashing", async () => {
    const badToken = "header.!!!not-base64!!!.signature";
    await runWithRls(fakeReq(badToken), async () => "ok");

    const setConfigCall = mockTx.execute.mock.calls[0]![0] as any;
    const claimsChunk = setConfigCall.queryChunks?.find(
      (chunk: any) => typeof chunk === "string",
    );
    // The garbled payload does not contain a valid user sub
    expect(claimsChunk).not.toContain('"sub":"user_');
  });

  // TC-RLS-04
  it("defaults to null-sub claims when authToken is undefined (fail-closed)", async () => {
    await runWithRls(fakeReq(undefined), async () => "ok");

    const setConfigCall = mockTx.execute.mock.calls[0]![0] as any;
    const claimsChunk = setConfigCall.queryChunks?.find(
      (chunk: any) => typeof chunk === "string" && chunk.includes('"sub"'),
    );
    expect(claimsChunk).toBe(JSON.stringify({ sub: null, role: "authenticated" }));
  });

  // TC-RLS-05
  it("executes SET LOCAL ROLE authenticated inside the transaction", async () => {
    await runWithRls(fakeReq(makeJwt({ sub: "u1" })), async () => "ok");

    // Second tx.execute call is the SET LOCAL ROLE statement
    expect(mockTx.execute).toHaveBeenCalledTimes(2);
    const roleCall = mockTx.execute.mock.calls[1]![0] as any;
    const serialized = JSON.stringify(roleCall);
    expect(serialized).toContain("SET LOCAL ROLE authenticated");
  });

  // TC-RLS-06
  it("surfaces a downstream exception so the transaction rolls back", async () => {
    const boom = new Error("downstream kaboom");

    await expect(
      runWithRls(fakeReq(makeJwt({ sub: "u2" })), async () => {
        throw boom;
      }),
    ).rejects.toThrow("downstream kaboom");
  });
});
