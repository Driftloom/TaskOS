/**
 * Redacts credentials out of `memory_facts` rows before they are serialized to
 * a client.
 *
 * ## Why this exists
 *
 * `memory_facts.value` is JSONB and is used for two unrelated purposes:
 *
 * 1. **User-facing learned patterns** — the "What Cadence Knows About Me" screen
 *    renders these, so `value` is genuinely needed by the client.
 * 2. **Integration credentials** — `saveConfigFact` in `routes/integrations.ts`
 *    writes the Telegram bot token to `key = 'telegram_config'` with
 *    `category = 'channel'`.
 *
 * `GET /memory/facts` selected whole rows with no column projection, so a
 * `channel` row's `value.botToken` was returned in plaintext to any
 * authenticated caller. The integrations UI is deliberately write-only — it
 * never re-renders the token after save — and this endpoint handed it straight
 * back, defeating that design.
 *
 * ## The two-layer approach
 *
 * Layer 1 (`channel` ⇒ drop `value` entirely) covers the known case. Layer 2
 * (secret-named keys stripped from every other `value`) covers the unknown
 * case: `POST /memory/facts` lets a client file a `channel` fact with an
 * arbitrary `value`, and any future integration storing a credential under a
 * different category is still caught. Layers overlap deliberately — a denylist
 * alone would silently start leaking the first time someone names a secret
 * `authToken`, and an allowlist alone would hide the `value` the /memory page
 * exists to show.
 *
 * ## The one exception inside Layer 1
 *
 * Dropping `value` wholesale also dropped the PROVENANCE of a fact the user
 * wrote by hand: `createdByUser` and their own `userNote`. A hand-typed
 * statement then came back looking like an inference — badged "Inferred from
 * chat", given a confidence meter, and queued for a confirmation the user was
 * never asked for. The user never saw their own note again either.
 *
 * So Layer 1 now keeps exactly two keys for an opaque category: the
 * `createdByUser` marker and the user's own `userNote`. Both are written by
 * the manual-add form, neither is a credential, and neither is named like one.
 * Everything else in an opaque `value` — `botToken`, `botUsername`, the
 * Healthchecks ping URLs, and any key added later — is still dropped, so the
 * "the rest of a channel fact's value is not client-readable" guarantee
 * stands.
 */

import { USER_AUTHORED_KEY, USER_NOTE_KEY } from "./memory-fact-provenance";

const SECRET_KEY_PATTERN =
  /(token|secret|apikey|api_key|password|passphrase|privatekey|private_key|ciphertext|credential|authorization|bearer)/i;

/** Categories whose `value` is never useful to a client. */
const OPAQUE_VALUE_CATEGORIES = new Set(["channel"]);

/**
 * The only keys of an opaque `value` that reach a client.
 *
 * `createdByUser` says who wrote the fact; `userNote` is the user's own text.
 * Both come from the manual-add form. Neither is a credential, and neither is
 * named like one, so the secret denylist would not have caught them anyway.
 */
const OPAQUE_VALUE_ALLOWLIST = new Set<string>([USER_AUTHORED_KEY, USER_NOTE_KEY]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Removes secret-named keys from a JSON value, recursively.
 *
 * Recurses because integration configs nest (`{ telegram: { botToken } }`), and
 * a top-level-only filter would let a nested token through.
 */
function stripSecretKeys(value: unknown, depth = 0): unknown {
  // Depth cap guards against a self-referential object built by a hostile
  // client; JSON.parse cannot produce one, but this value also arrives from
  // other writers.
  if (depth > 8 || !isPlainObject(value)) return value;

  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) {
    if (SECRET_KEY_PATTERN.test(key)) continue;
    out[key] = stripSecretKeys(inner, depth + 1);
  }
  return out;
}

/**
 * The subset of an opaque `value` that a client is allowed to see.
 *
 * Returns an empty object when nothing survives, so the caller can keep
 * omitting `value` entirely — a channel fact with no user-authored content
 * still looks exactly like it did before this exception existed.
 */
function pickOpaqueValue(value: unknown): Record<string, unknown> {
  if (!isPlainObject(value)) return {};

  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) {
    if (!OPAQUE_VALUE_ALLOWLIST.has(key)) continue;
    if (SECRET_KEY_PATTERN.test(key)) continue;
    out[key] = inner;
  }
  return out;
}

/**
 * Returns a copy of a memory fact safe to send to a client.
 *
 * Never mutates the input — the caller still holds the real row (including the
 * token) for server-side use such as `getTelegramBotTokenForUser`.
 */
export function sanitizeMemoryFact<T extends { category?: string | null; value?: unknown }>(
  fact: T,
): Omit<T, "value"> & { value?: Record<string, unknown> } {
  if (!isPlainObject(fact)) return fact as never;

  const category = typeof fact.category === "string" ? fact.category : null;

  if (category !== null && OPAQUE_VALUE_CATEGORIES.has(category)) {
    const { value, ...rest } = fact;
    const kept = pickOpaqueValue(value);
    // Nothing the client may see: keep omitting `value` entirely, exactly as
    // before, so an integration row is still just a name and a title.
    if (Object.keys(kept).length === 0) return rest as never;
    return { ...rest, value: kept } as never;
  }

  if (fact.value === undefined || fact.value === null) return fact as never;

  return { ...fact, value: stripSecretKeys(fact.value) as Record<string, unknown> };
}

/** Map form of {@link sanitizeMemoryFact}. */
export function sanitizeMemoryFacts<T extends { category?: string | null; value?: unknown }>(
  facts: T[],
): Array<Omit<T, "value"> & { value?: Record<string, unknown> }> {
  if (!Array.isArray(facts)) return [];
  return facts.map((f) => sanitizeMemoryFact(f));
}

/**
 * Projection for internal reads that must keep the credential but must not
 * return it wholesale. Used where a caller needs `value` for its own use and
 * the shape is being handed onward.
 */
export function withoutSecrets<T extends { value?: unknown }>(fact: T): T {
  return { ...fact, value: stripSecretKeys(fact.value) };
}