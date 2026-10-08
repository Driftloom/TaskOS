/**
 * Formats a user search string into a safe PostgreSQL tsquery with prefix matching.
 * E.g. "buy milk" -> "'buy':* & 'milk':*"
 * E.g. "meeting & * !" -> "'meeting':*"
 * Returns null if input contains no searchable words.
 */
export function formatTsQuery(raw: string): string | null {
  if (!raw || typeof raw !== "string") return null;

  const tokens = raw
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/['":*&|!()\\]/g, "").trim())
    .filter((w) => w.length > 0);

  if (tokens.length === 0) return null;

  return tokens.map((token) => `'${token}':*`).join(" & ");
}
