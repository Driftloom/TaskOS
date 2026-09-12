import { sql } from "drizzle-orm";
import type { Request } from "express";
import { db, type DbTransaction } from "@workspace/db";

/**
 * Run Drizzle queries as the Supabase `authenticated` role with the caller's
 * Clerk JWT attached, so Postgres RLS policies actually enforce isolation.
 *
 * Why this exists: the pool connects with an owner-level DATABASE_URL, which
 * bypasses RLS on its own. Pointing the URL at Supabase without this helper
 * changes nothing security-wise. Each call opens a transaction, pins
 * `request.jwt.claims` to this request's session token, drops to the
 * `authenticated` role for the transaction only, then runs the callback.
 *
 * Fail-closed: if the request carries no session token, we still drop to
 * `authenticated` with a claims payload that matches no user, so policies
 * deny every row instead of silently running unscoped as the owner.
 *
 * The JWT signature is verified by Postgres/Supabase against the Clerk JWKS
 * (native third-party-auth integration); here we only forward the payload.
 */
function claimsJsonFromJwt(token: string): string {
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[1]) {
    throw new Error("Malformed session token");
  }
  const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}

const NO_USER_CLAIMS = JSON.stringify({ sub: null, role: "authenticated" });

export async function runWithRls<T>(
  req: Request,
  fn: (tx: DbTransaction) => Promise<T>,
): Promise<T> {
  const claims = req.authToken ? claimsJsonFromJwt(req.authToken) : NO_USER_CLAIMS;
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT set_config('request.jwt.claims', ${claims}, true)`,
    );
    await tx.execute(sql`SET LOCAL ROLE authenticated`);
    return fn(tx);
  });
}
