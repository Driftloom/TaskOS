/**
 * The nightly decay pass must leave a fact the USER wrote alone.
 *
 * A hand-typed statement carries no measured confidence, so there is nothing
 * to decay. Running it through the decay formula anyway replaced "not
 * measured" with the decay FLOOR (10) — a fabricated number, and a different
 * one every time the formula was applied.
 *
 * `lib/memory.ts` imports `@workspace/db`, which throws without DATABASE_URL,
 * so the database is mocked here. The real decay loop and the real
 * `calculateDecayedConfidence` still run; only the rows are faked.
 */
process.env.DATABASE_URL ??=
  "postgresql://postgres:postgres@127.0.0.1:1/postgres?connect_timeout=1";

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Test state, hoisted so the @workspace/db mock factory can reach it.
// ---------------------------------------------------------------------------

const { state } = vi.hoisted(() => ({
  state: {
    /** The active, non-archived rows the decay pass reads. */
    facts: [] as Array<Record<string, unknown>>,
    /** Every UPDATE payload the fake saw. */
    updates: [] as Array<Record<string, unknown>>,
  },
}));

vi.mock("@workspace/db", async (importOriginal) => {
  // The real module throws without DATABASE_URL. Set it HERE, inside the
  // factory: vitest hoists `vi.mock` above the module body, so a top-level
  // assignment would run too late.
  process.env.DATABASE_URL ??=
    "postgresql://postgres:postgres@127.0.0.1:1/postgres?connect_timeout=1";

  const actual = await importOriginal<typeof import("@workspace/db")>();

  const fakeDb = {
    select: () => {
      let table: unknown;
      const chain: Record<string, unknown> = {};
      chain.from = (t: unknown) => {
        table = t;
        return chain;
      };
      chain.leftJoin = () => chain;
      chain.where = () => chain;
      chain.groupBy = () => chain;
      chain.orderBy = () => chain;
      chain.limit = () => chain;
      chain.then = (resolve: (v: unknown) => unknown) => {
        // The tasks/focus-sessions join finds nothing, so no pattern is
        // detected and nothing is inserted. The decay pass reads the facts.
        resolve(table === actual.memoryFactsTable ? state.facts : []);
      };
      return chain;
    },
    update: () => {
      let setPayload: Record<string, unknown> = {};
      const chain: Record<string, unknown> = {};
      chain.set = (payload: Record<string, unknown>) => {
        setPayload = payload;
        return chain;
      };
      chain.where = () => chain;
      chain.then = (resolve: (v: unknown) => unknown) => {
        state.updates.push(setPayload);
        resolve([]);
      };
      return chain;
    },
    insert: () => {
      const chain: Record<string, unknown> = {};
      chain.values = () => chain;
      chain.returning = () => chain;
      chain.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve([]).then(resolve);
      return chain;
    },
  };

  return { ...actual, db: fakeDb };
});

import { computeSourceAArithmetic } from "./memory";

const NOW = new Date("2026-10-21T00:00:00.000Z");

/** A learned fact: a measured confidence, old enough to have decayed. */
const learnedFact = {
  id: 1,
  userId: "user-1",
  key: "evening_slump",
  title: "You slip on evening tasks.",
  category: "procrastination",
  source: "behavioral",
  confidence: 90,
  evidenceCount: 12,
  lastReinforcedAt: new Date(NOW.getTime() - 120 * 86_400_000),
  archived: false,
  pendingConfirmation: false,
  rule9Multiplier: null,
  value: { pattern: "avoids evening tasks" },
};

/** A fact the user typed: no measured confidence to decay. */
const userAuthoredFact = {
  id: 2,
  userId: "user-1",
  key: "sunday_sprint",
  title: "I sprint on Sunday mornings.",
  category: "chronotype",
  source: "conversational",
  confidence: 0,
  evidenceCount: 1,
  lastReinforcedAt: NOW,
  archived: false,
  pendingConfirmation: false,
  rule9Multiplier: null,
  value: { userNote: "Sundays are for deep work.", createdByUser: true },
};

describe("the nightly decay pass", () => {
  beforeEach(() => {
    state.facts = [];
    state.updates.length = 0;
  });

  it("decays a learned fact, because it has a measured confidence", async () => {
    state.facts = [learnedFact];

    await computeSourceAArithmetic("user-1", NOW);

    expect(state.updates.length).toBe(1);
    expect(state.updates[0].confidence).toBeLessThan(90);
  });

  it("leaves a fact the user written alone — nothing was measured to decay", async () => {
    state.facts = [userAuthoredFact];

    await computeSourceAArithmetic("user-1", NOW);

    // Without the skip, the decay formula would have floored the stored 0 at
    // 10 and written that back — a fabricated measurement.
    expect(state.updates.length).toBe(0);
  });

  it("still decays a learned fact that sits next to a user-written one", async () => {
    state.facts = [learnedFact, userAuthoredFact];

    await computeSourceAArithmetic("user-1", NOW);

    expect(state.updates.length).toBe(1);
    expect(state.updates[0].confidence).toBeLessThan(90);
  });
});
