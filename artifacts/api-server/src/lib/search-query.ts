/**
 * Formats a user search query into a sanitized PostgreSQL `tsquery` string with prefix matching.
 * Strips special tsquery operators and punctuation to avoid syntax errors and SQL injection risks.
 *
 * @param {string} raw - The raw user search query string from input.
 * @returns {string | null} A formatted tsquery string (e.g., `'buy':* & 'milk':*`), or null if empty.
 *
 * @example
 * formatTsQuery("buy milk"); // "'buy':* & 'milk':*"
 * formatTsQuery("meeting & * !"); // "'meeting':*"
 * formatTsQuery("   "); // null
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
