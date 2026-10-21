/**
 * Provenance markers for a memory fact.
 *
 * `memory_facts.value` is a free-form JSONB payload. Most of what lives in it
 * is DATA about a fact. One key is not: it is a statement about WHO wrote the
 * fact, and it is what stops a hand-typed statement from being presented as
 * something Cadence inferred and measured.
 *
 *   `createdByUser: true`  ->  the user typed this. Nothing was inferred, no
 *                              confidence was measured, and it never entered the
 *                              confirmation queue.
 *
 * The marker travels inside `value` because the contract has no dedicated
 * column for it (and adding one would be a migration plus a contract change).
 * This module is the single place that knows the key, so the writer, the
 * sanitiser, the decay engine and the agent prompt cannot drift apart.
 *
 * It deliberately has NO database import: it is imported by the sanitiser,
 * whose unit test must not pull in `@workspace/db` (which throws without
 * DATABASE_URL).
 */

/** The key that marks a fact as written by the user. */
export const USER_AUTHORED_KEY = "createdByUser";

/** The key holding the user's own free-text note, written by the manual form. */
export const USER_NOTE_KEY = "userNote";

/**
 * True when the fact was typed by the user rather than inferred by Cadence.
 *
 * Only an exact `true` counts. A missing, absent or non-boolean marker means
 * "not user-authored", so every learned fact — and every fact written before
 * the marker existed — keeps the inference wording.
 */
export function isUserAuthoredValue(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  return (value as Record<string, unknown>)[USER_AUTHORED_KEY] === true;
}

/**
 * The confidence stored for a fact the user wrote.
 *
 * `memory_facts.confidence` is `NOT NULL` with a `CHECK (confidence BETWEEN 0
 * AND 100)`, so "not measured" cannot be stored as NULL. 0 is the honest
 * encoding: it is the column's own lower bound and the contract's
 * `minimum: 0`, and it records the ABSENCE of a measurement rather than a
 * measurement of absence. It is not a score, and the client never renders it
 * for such a fact.
 *
 * The decay engine skips these facts entirely, so the 0 is not later
 * overwritten by the decay floor (10) — which would be a fabricated number.
 */
export const UNMEASURED_CONFIDENCE = 0;
