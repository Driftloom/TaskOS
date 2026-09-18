import { describe, expect, it } from "vitest";
import { wouldCycle } from "./subtasks";

function fromMap(parents: Record<number, number | null>) {
  return async (id: number): Promise<number | null> => parents[id] ?? null;
}

describe("wouldCycle", () => {
  it("allows attaching under an unrelated root", async () => {
    // 1 is a root, 3 is elsewhere: 3 under 1 is fine.
    await expect(wouldCycle(3, 1, fromMap({ 1: null }))).resolves.toBe(false);
  });
  it("detects a direct back-edge", async () => {
    // 1 -> 2 -> 3 chain; assigning 1 under 3 closes the loop.
    const fetch = fromMap({ 3: 2, 2: 1, 1: null });
    await expect(wouldCycle(1, 3, fetch)).resolves.toBe(true);
  });
  it("detects a longer loop", async () => {
    // 1 -> 2 -> 3 -> 4 chain; assigning 2 under 4 closes the loop.
    const fetch = fromMap({ 4: 3, 3: 2, 2: 1, 1: null });
    await expect(wouldCycle(2, 4, fetch)).resolves.toBe(true);
  });
  it("allows reparenting to a sibling branch", async () => {
    // 1 -> {2, 3}; moving 2 under 3 is fine.
    const fetch = fromMap({ 3: 1, 2: 1, 1: null });
    await expect(wouldCycle(2, 3, fetch)).resolves.toBe(false);
  });
  it("treats dangling parents as roots", async () => {
    await expect(wouldCycle(9, 99, fromMap({}))).resolves.toBe(false);
  });
});
