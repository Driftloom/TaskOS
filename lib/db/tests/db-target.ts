/**
 * Which database is this test run pointed at?
 *
 * The destructive suite drops and recreates tables, so "is this safe" cannot be
 * inferred from whether the flag is set — it also has to be true that the target
 * is a throwaway local container. `DATABASE_URL` in the repo root points at live
 * Supabase, so a mis-set variable is a realistic accident, not a hypothetical.
 *
 * The classifier parses the hostname out of the URL rather than grepping the
 * whole string. A substring test (`url.includes("localhost")`) also matches a
 * password or database name containing that text, which would let a remote host
 * pass the loopback check.
 *
 * Fails closed: anything that cannot be parsed is treated as remote.
 */

export type DbTarget = "unset" | "local" | "remote";

const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function classifyTarget(databaseUrl: string | undefined): DbTarget {
  if (!databaseUrl) return "unset";
  let hostname: string;
  try {
    // The WHATWG parser lower-cases the host and keeps IPv6 brackets.
    hostname = new URL(databaseUrl).hostname;
  } catch {
    return "remote";
  }
  if (!hostname) return "remote";
  return LOOPBACK.has(hostname) || LOOPBACK.has(hostname.replace(/^\[|\]$/g, ""))
    ? "local"
    : "remote";
}

export function isLocalTarget(databaseUrl: string | undefined): boolean {
  return classifyTarget(databaseUrl) === "local";
}

/** The operator has explicitly asked for the destructive suite to run. */
export function destructiveOptIn(): boolean {
  return process.env.CADENCE_ALLOW_DESTRUCTIVE_DB_TESTS === "1";
}

/**
 * The dangerous configuration: destructive tests enabled against a remote
 * database. Refusing to skip is the point — a silent skip here would let someone
 * believe the suite ran, or would quietly downgrade a real mistake to a no-op
 * while production sits behind the URL.
 */
export const REMOTE_HOST_REFUSAL =
  "REFUSING TO RUN: CADENCE_ALLOW_DESTRUCTIVE_DB_TESTS=1 is set but DATABASE_URL " +
  "points at a remote host. These tests DROP and RECREATE tables, so running them " +
  "here would destroy real data.\n" +
  "  Point DATABASE_URL at a throwaway local Postgres (see " +
  "docs/governance/database-operations.md section 5), or unset " +
  "CADENCE_ALLOW_DESTRUCTIVE_DB_TESTS.";