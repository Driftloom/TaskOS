/**
 * The server's discovered-model contract, and the badge helper that goes with
 * it.
 *
 * `GET /api/agent/models/:provider` returns the server's `DiscoveredModel`
 * shape (artifacts/api-server/src/lib/agent/discovery.ts):
 *
 *   { id, label, badge?, description, tier }
 *
 * The frontend used to read `name` / `tierBadge`, which the server has never
 * sent, so in production every model option rendered "undefined" and carried no
 * badge. Both surfaces that render discovered models — the agent panel's model
 * switcher and the settings page's model select — now read this shape.
 *
 * This lives in `src/lib` rather than in either component on purpose: it is a
 * DATA CONTRACT, not a component. Keeping it here means neither page has to
 * import the other's component to obtain it, which matters because the settings
 * page and the agent page are both lazily loaded — a page importing a sibling
 * feature's component drags that whole component (and everything it pulls in)
 * into both routes' chunks.
 */

/** One discovered model, exactly as the server sends it. */
export interface DiscoveredModelResponse {
  id: string;
  label: string;
  badge?: string;
  description: string;
  tier: string;
}

/**
 * The badge vocabulary the server actually emits: `formatModelBadge` in
 * discovery.ts plus the curated lists in providers.ts.
 *
 * Matched case-insensitively so a lower-case badge still reads correctly, and
 * anything outside this list is passed through untouched — the server stays the
 * only authority on what a badge says, so a badge the client has never seen is
 * shown rather than silently dropped.
 */
const SERVER_BADGE_LABELS = [
  'Recommended',
  'Cheapest',
  'Ultra Fast',
  'Fast',
  'Advanced',
  'Deep Reasoning',
  'High Capability',
  'MoE',
  'Premier',
  'Value',
  'Default',
] as const;

/** Canonical display badge for a badge string the server sent. */
export function canonicalModelBadge(badge: string | undefined): string | undefined {
  const trimmed = badge?.trim();
  if (!trimmed) return undefined;
  const known = SERVER_BADGE_LABELS.find((b) => b.toLowerCase() === trimmed.toLowerCase());
  return known ?? trimmed;
}
