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
 */

const SECRET_KEY_PATTERN =
  /(token|secret|apikey|api_key|password|passphrase|privatekey|private_key|ciphertext|credential|authorization|bearer)/i;

/** Categories whose `value` is never useful to a client. */
const OPAQUE_VALUE_CATEGORIES = new Set(["channel"]);

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
    const { value: _dropped, ...rest } = fact;
    return rest as never;
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