/**
 * T9 — approving an inferred fact must not mint a confidence.
 *
 * `POST /memory/confirmations/:id/approve` used to overwrite the fact's
 * confidence with the constant `85`. The inference that produced the fact had
 * a measured confidence; overwriting it with a round number the server
 * invented produced a fabricated measurement, and the card then displayed it
 * to the user as "High · 85%".
 *
 * Approving is a decision about whether a fact may be used, not a new
 * measurement of it. The existing confidence is therefore left alone.
 */
process.env.DATABASE_URL ??=
  "postgresql://postgres:postgres@127.0.0.1:1/postgres?connect_timeout=1";

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import type { Server } from "node:http";

// ---------------------------------------------------------------------------
// Test state, hoisted so the @workspace/db mock factory can reach it.
// ---------------------------------------------------------------------------

const { state } = vi.hoisted(() => ({
  state: {
    /** The row as it exists in the database before the approval. */
    storedFact: null as Record<string, unknown> | null,
    /** Every UPDATE payload the fake saw. */
    updates: [] as Array<Record<string, unknown>>,
  },
}));

// ---------------------------------------------------------------------------
// Mock @workspace/db. Only `db` is replaced; the schema is untouched.
// ---------------------------------------------------------------------------

vi.mock("@workspace/db", async (importOriginal) => {
  process.env.DATABASE_URL ??=
    "postgresql://postgres:postgres@127.0.0.1:1/postgres?connect_timeout=1";

  const actual = await importOriginal<typeof import("@workspace/db")>();

  const tx = {
    execute: async () => undefined,
    select: () => {
      const chain: Record<string, unknown> = {};
      chain.from = () => chain;
      chain.where = () => chain;
      chain.orderBy = () => chain;
      chain.limit = () => chain;
      chain.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve([]).then(resolve);
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
      chain.returning = () => chain;
      chain.then = (resolve: (v: unknown) => unknown) => {
        state.updates.push(setPayload);
        const stored = state.storedFact;
        // The row the database would return: the stored row with the UPDATE
        // applied on top of it. If the UPDATE carried a confidence, the
        // returned row would carry it too.
        resolve(stored ? [{ ...stored, ...setPayload }] : []);
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
    delete: () => {
      const chain: Record<string, unknown> = {};
      chain.where = () => chain;
      chain.returning = () => chain;
      chain.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve([]).then(resolve);
      return chain;
    },
  };

  return {
    ...actual,
    db: {
      transaction: async (fn: (t: unknown) => Promise<unknown>) => fn(tx),
    },
  };
});

// ---------------------------------------------------------------------------
// Mock the auth middleware so the route can be exercised without a Clerk
// session. Only `requireAuth` is replaced; the router under test is real.
// ---------------------------------------------------------------------------

vi.mock("../middlewares/auth", () => ({
  requireAuth: (
    req: { userId?: string },
    _res: unknown,
    next: () => void,
  ): void => {
    req.userId = "memory-user-1";
    next();
  },
}));

// ---------------------------------------------------------------------------
// HTTP harness
// ---------------------------------------------------------------------------

let server: Server;
let baseUrl: string;

const memoryRouter = (await import("./memory")).default;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api", memoryRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
}, 60_000);

afterAll(async () => {
  await new Promise<void>((resolve) => server?.close(() => resolve()));
}, 30_000);

beforeEach(() => {
  state.updates.length = 0;
  state.storedFact = {
    id: 7,
    userId: "memory-user-1",
    key: "morning_person",
    title: "You are a morning person.",
    category: "chronotype",
    source: "conversational",
    confidence: 62,
    evidenceCount: 3,
    lastReinforcedAt: null,
    rule9Multiplier: null,
    pendingConfirmation: true,
    archived: false,
    value: { confirmationPrompt: "You are a morning person?" },
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
  };
});

describe("POST /api/memory/confirmations/:id/approve", () => {
  it("keeps the confidence the inference measured", async () => {
    const res = await fetch(`${baseUrl}/api/memory/confirmations/7/approve`, {
      method: "POST",
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as { fact: { confidence: number } };
    expect(body.fact.confidence).toBe(62);
  });

  it("never writes a confidence of its own", async () => {
    await fetch(`${baseUrl}/api/memory/confirmations/7/approve`, { method: "POST" });

    expect(state.updates.length).toBe(1);
    expect(state.updates[0]).not.toHaveProperty("confidence");
  });

  it("still takes the fact out of the confirmation queue", async () => {
    const res = await fetch(`${baseUrl}/api/memory/confirmations/7/approve`, {
      method: "POST",
    });
    const body = (await res.json()) as {
      fact: { pendingConfirmation: boolean; confidence: number };
    };

    expect(body.fact.pendingConfirmation).toBe(false);
    expect(body.fact.confidence).toBe(62);
  });

  it("answers 404 when there is nothing to approve", async () => {
    state.storedFact = null;
    const res = await fetch(`${baseUrl}/api/memory/confirmations/7/approve`, {
      method: "POST",
    });
    expect(res.status).toBe(404);
  });
});
