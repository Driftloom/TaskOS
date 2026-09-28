import { timingSafeEqual } from "node:crypto";

/**
 * Constant-time secret comparison for shared-secret gates.
 *
 * A plain `!==` short-circuits on the first differing byte, so response timing
 * leaks the secret prefix one byte at a time. `timingSafeEqual` requires
 * equal-length buffers, hence the explicit length check; the length itself is
 * not treated as secret.
 *
 * Returns false when either side is absent: an unconfigured secret must never
 * authenticate anything.
 */
export function secretMatches(provided: string | undefined, expected: string | undefined): boolean {
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
