/**
 * Tag-name normalization (single rule, enforced everywhere tags are written):
 * trim, lowercase, collapse inner whitespace. Returns null when the result
 * is empty or exceeds the 40-char contract limit.
 */
export function normalizeTagName(raw: string): string | null {
  const name = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (!name || name.length > 40) return null;
  return name;
}
