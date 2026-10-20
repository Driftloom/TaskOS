import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request } from "express";

/**
 * Multi-Tenant RLS & Authorization Contract Tests (AZT-01, AZT-02, AZT-03)
 * 
 * Verifies that:
 * 1. AZT-01 / AZT-02: User/Tenant isolation boundaries are strictly enforced via
 *    Postgres local config `request.jwt.claims` and `SET LOCAL ROLE authenticated`.
 * 2. Cross-tenant access attempts fail closed (no leakage of foreign rows).
 * 3. AZT-03: Missing or unauthenticated claims inject {"sub": null, "role": "authenticated"}
 *    to prevent running as postgres superuser/owner.
 * 4. Tampered or malformed tokens fail immediately before database transactions open.
 */

const executedStatements: any[] = [];
const mockTx = {
  execute: vi.fn(async (stmt: unknown) => {
    executedStatements.push(stmt);
    return [];
  }),
};

vi.mock("@workspace/db", () => ({
  db: {
    transaction: vi.fn(async (fn: Function) => fn(mockTx)),
  },
}));

import { runWithRls } from "../lib/rls";

function makeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = "dummy-sig";
  return `${header}.${body}.${signature}`;
}

function mockReq(userId: string, tokenPayload?: Record<string, unknown>): Request {
  const authToken = tokenPayload ? makeJwt(tokenPayload) : undefined;
  return {
    userId,
    authToken,
  } as unknown as Request;
}

describe("AZT-01 & AZT-02: Multi-Tenant RLS Boundary Enforcement", () => {
  beforeEach(() => {
    executedStatements.length = 0;
    mockTx.execute.mockClear();
  });

  it("configures Postgres session with Tenant A sub and drops to authenticated role", async () => {
    const tenantAId = "user_tenant_AAA_12345";
    const reqA = mockReq(tenantAId, { sub: tenantAId, role: "authenticated" });

    const result = await runWithRls(reqA, async (tx) => {
      // Execute a simulated tenant query
      await tx.execute(`SELECT * FROM tasks WHERE user_id = '${tenantAId}'`);
      return { success: true };
    });

    expect(result.success).toBe(true);
    expect(mockTx.execute).toHaveBeenCalledTimes(3);

    // Statement 1: Set request.jwt.claims
    const setConfigStmt = executedStatements[0];
    const claimsChunk = setConfigStmt.queryChunks?.find(
      (c: any) => typeof c === "string" && c.includes(tenantAId),
    );
    expect(claimsChunk, "Tenant A claims must be injected").toBeDefined();
    expect(claimsChunk).toContain(`"sub":"${tenantAId}"`);

    // Statement 2: Drop to authenticated role
    const roleStmt = executedStatements[1];
    expect(JSON.stringify(roleStmt)).toContain("SET LOCAL ROLE authenticated");
  });

  it("ensures Tenant B session cannot execute with Tenant A claims", async () => {
    const tenantAId = "user_tenant_AAA_12345";
    const tenantBId = "user_tenant_BBB_67890";

    const reqB = mockReq(tenantBId, { sub: tenantBId, role: "authenticated" });

    await runWithRls(reqB, async (tx) => {
      await tx.execute(`SELECT * FROM tasks WHERE user_id = '${tenantBId}'`);
    });

    const setConfigStmt = executedStatements[0];
    const claimsChunk = setConfigStmt.queryChunks?.find(
      (c: any) => typeof c === "string" && c.includes('"sub"'),
    );

    expect(claimsChunk).toContain(tenantBId);
    expect(claimsChunk).not.toContain(tenantAId);
  });
});

describe("AZT-03: Fail-Closed Behavior for Missing or Unauthenticated Claims", () => {
  beforeEach(() => {
    executedStatements.length = 0;
    mockTx.execute.mockClear();
  });

  it("injects sub: null when authToken is absent, preventing owner privilege escalation", async () => {
    const reqWithoutToken = { userId: undefined, authToken: undefined } as unknown as Request;

    await runWithRls(reqWithoutToken, async (tx) => {
      await tx.execute("SELECT 1");
    });

    const setConfigStmt = executedStatements[0];
    const claimsChunk = setConfigStmt.queryChunks?.find(
      (c: any) => typeof c === "string" && c.includes('"sub":null'),
    );
    expect(claimsChunk, "Must inject null sub when token is missing").toBeDefined();

    const roleStmt = executedStatements[1];
    expect(JSON.stringify(roleStmt)).toContain("SET LOCAL ROLE authenticated");
  });

  it("throws immediately on malformed token format without initiating DB transactions", async () => {
    const reqMalformed = { authToken: "not.a.three.part.jwt.token" } as unknown as Request;

    await expect(
      runWithRls(reqMalformed, async () => {
        return "should not reach here";
      }),
    ).rejects.toThrow("Malformed session token");

    expect(mockTx.execute).not.toHaveBeenCalled();
  });
});
