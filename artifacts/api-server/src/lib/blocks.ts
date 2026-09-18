/** Half-open interval overlap for time blocks: [startAt, endAt). Adjacent
 *  blocks (one ends exactly when the next starts) do NOT overlap. */
export interface BlockRange {
  startAt: Date;
  endAt: Date;
}

export function rangesOverlap(a: BlockRange, b: BlockRange): boolean {
  return a.startAt.getTime() < b.endAt.getTime() &&
    b.startAt.getTime() < a.endAt.getTime();
}

export function findOverlap(
  candidate: BlockRange,
  existing: BlockRange[],
): BlockRange | null {
  return existing.find((range) => rangesOverlap(candidate, range)) ?? null;
}
