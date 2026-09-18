/**
 * Subtask cycle guard. Walks the ancestor chain of the proposed parent via
 * an injected fetcher (DB-backed in routes, stub maps in tests) and reports
 * whether assigning parentId to taskId would close a loop. Self-parenting
 * never reaches here — the DB CHECK rejects it first.
 */
export async function wouldCycle(
  taskId: number,
  parentId: number,
  fetchParent: (id: number) => Promise<number | null>,
): Promise<boolean> {
  const seen = new Set<number>([taskId]);
  let current: number | null = parentId;
  while (current !== null) {
    if (seen.has(current)) return true;
    seen.add(current);
    current = await fetchParent(current);
  }
  return false;
}
