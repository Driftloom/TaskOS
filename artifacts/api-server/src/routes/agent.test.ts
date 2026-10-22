/**
 * T7 — the LLM spend ceiling is filtered to the month it claims.
 *
 * `GET /api/agent/usage` is documented as "Month-to-date LLM usage and spend"
 * and the /agent screen renders that number against the monthly D-08/D-27
 * ceiling ($5.00 / month). The query behind it filtered on `user_id` ONLY, so
 * the figure on the card was ALL-TIME spend wearing a monthly label — the UI
 * stated a month it had not measured.
 *
 * The same unfiltered query backs `spendAlert.totalMonthCostCents` in the
 * agent engine, so the "you exceeded your monthly ceiling" signal was also
 * all-time.
 *
 * There is no live Postgres in this package's test run and no supertest, so
 * these tests boot the REAL Express router over real HTTP and drive the REAL
 * Drizzle query builder. Only the database is faked, and the fake evaluates
 * the WHERE clause the route actually compiled: it reads the predicates out of
 * the generated SQL and applies them to the seeded rows. Drop the month
 * predicate from the query and the 60-day-old row stops being filtered out,
 * which is exactly what the assertions below catch.
 */
process.env.DATABASE_URL ??=
  "postgresql://postgres:postgres@127.0.0.1:1/postgres?connect_timeout=1";

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import express from "express";
import type { Server } from "node:http";
import { PgDialect } from "drizzle-orm/pg-core";
import { agentActionLogTable, llmUsageTable } from "@workspace/db";
import { MONTHLY_SPEND_CEILING_CENTS } from "../lib/agent/engine";
import { DEFAULT_TIME_ZONE, currentMonthStartUtc } from "../lib/month-window";

// ---------------------------------------------------------------------------
// Test state, hoisted so the @workspace/db mock factory can reach it.
// ---------------------------------------------------------------------------

interface SeededRow {
  id: number;
  userId: string;
  tokensIn: number;
  tokensOut: number;
  costEstimateCents: number;
  createdAt: Date;
}

interface AgentActionRow {
  id: number;
  userId: string;
  createdAt: Date;
}

const { state } = vi.hoisted(() => ({
  state: {
    rows: [] as SeededRow[],
    actionRows: [] as AgentActionRow[],
    /** Every query the fake saw, with the table it read from. */
    queries: [] as Array<{ table: unknown; sql: string; params: unknown[] }>,
    now: new Date(),
  },
}));

// ---------------------------------------------------------------------------
// Mock @workspace/db. Only `db` is replaced; the schema (and therefore the
// real table and column names, and the SQL the builder emits) is untouched.
// ---------------------------------------------------------------------------

vi.mock("@workspace/db", async (importOriginal) => {
  process.env.DATABASE_URL ??=
    "postgresql://postgres:postgres@127.0.0.1:1/postgres?connect_timeout=1";

  const actual = await importOriginal<typeof import("@workspace/db")>();
  const dialect = new PgDialect();

  /** Aggregate the seeded rows that survive the compiled WHERE clause. */
  function aggregate(rows: SeededRow[]) {
    const tokensIn = rows.reduce((n, r) => n + r.tokensIn, 0);
    const tokensOut = rows.reduce((n, r) => n + r.tokensOut, 0);
    const cost = rows.reduce((n, r) => n + r.costEstimateCents, 0);
    return {
      totalTokensIn: tokensIn,
      totalTokensOut: tokensOut,
      totalCostEstimateCents: cost,
      totalCalls: rows.length,
      totalCents: cost,
    };
  }

  /**
   * A tiny reader for the SQL subset this query is allowed to use. It is not a
   * query engine and it does not know the answer: it reads the column and the
   * `date_trunc` unit out of the generated SQL and applies them to the rows.
   */
  function truncateNow(unit: string, now: Date): Date {
    switch (unit) {
      case "day":
        return new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
        );
      case "month":
        return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      case "year":
        return new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
      default:
        throw new Error(`unsupported date_trunc unit in the query: ${unit}`);
    }
  }

  const COLUMN_READERS: Record<string, (row: SeededRow) => unknown> = {
    user_id: (r) => r.userId,
    tokens_in: (r) => r.tokensIn,
    tokens_out: (r) => r.tokensOut,
    cost_estimate_cents: (r) => r.costEstimateCents,
    created_at: (r) => r.createdAt,
  };

  function readerFor(column: string): (row: SeededRow) => unknown {
    const read = COLUMN_READERS[column];
    if (!read) throw new Error(`unknown column in the query: ${column}`);
    return read;
  }

  function applyWhere<T>(
    whereSql: string,
    params: unknown[],
    rows: T[],
    now: Date,
  ): T[] {
    const equality = /"([a-z_]+)" = \$(\d+)/g;
    const truncBound = /"([a-z_]+)" >= date_trunc\('([a-z]+)', now\(\)\)/g;
    const paramBound = /"([a-z_]+)" >= \$(\d+)/g;

    return rows.filter((row) => {
      for (const m of whereSql.matchAll(equality)) {
        if (readerFor(m[1])(row as SeededRow) !== params[Number(m[2]) - 1]) return false;
      }
      for (const m of whereSql.matchAll(truncBound)) {
        const value = readerFor(m[1])(row as SeededRow);
        if (!(value instanceof Date)) return false;
        if (value.getTime() < truncateNow(m[2], now).getTime()) return false;
      }
      for (const m of whereSql.matchAll(paramBound)) {
        const value = readerFor(m[1])(row as SeededRow);
        const cutoff = params[Number(m[2]) - 1];
        // Drizzle encodes a bound timestamp to its ISO instant before it
        // reaches the driver, so the parameter arrives as a string.
        const cutoffMs =
          cutoff instanceof Date ? cutoff.getTime() : new Date(String(cutoff)).getTime();
        if (!(value instanceof Date) || Number.isNaN(cutoffMs)) return false;
        if (value.getTime() < cutoffMs) return false;
      }
      return true;
    });
  }

  function emptyChain() {
    const chain: Record<string, unknown> = {};
    for (const method of [
      "from",
      "where",
      "orderBy",
      "limit",
      "offset",
      "set",
      "values",
      "returning",
      "onConflictDoUpdate",
    ]) {
      chain[method] = () => chain;
    }
    chain.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve([]).then(resolve);
    return chain;
  }

  const fakeDb = {
    select: (..._fields: unknown[]) => {
      let table: unknown;
      let whereClause: unknown;
      let limitValue: number | undefined;
      const chain: Record<string, unknown> = {};
      chain.from = (t: unknown) => {
        table = t;
        return chain;
      };
      chain.where = (w: unknown) => {
        whereClause = w;
        return chain;
      };
      for (const method of ["orderBy", "offset", "groupBy", "for"]) {
        chain[method] = () => chain;
      }
      chain.limit = (n: unknown) => {
        limitValue = Number(n);
        return chain;
      };
      chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
        try {
          const compiled = whereClause
            ? dialect.sqlToQuery(whereClause as never)
            : { sql: "", params: [] as unknown[] };
          state.queries.push({
            table,
            sql: compiled.sql,
            params: compiled.params as unknown[],
          });

          if (table === actual.agentActionLogTable) {
            const matching = applyWhere(
              compiled.sql,
              compiled.params as unknown[],
              state.actionRows,
              state.now,
            );
            const limited =
              typeof limitValue === "number"
                ? matching.slice(0, limitValue)
                : matching;
            resolve(limited);
            return;
          }
          if (table !== actual.llmUsageTable) {
            resolve([]);
            return;
          }
          const matching = applyWhere(
            compiled.sql,
            compiled.params as unknown[],
            state.rows,
            state.now,
          );
          resolve([aggregate(matching)]);
        } catch (err) {
          reject(err);
        }
      };
      return chain;
    },
    insert: () => emptyChain(),
    update: () => emptyChain(),
    delete: () => emptyChain(),
    execute: async () => undefined,
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(fakeDb),
  };

  return { ...actual, db: fakeDb };
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
    req.userId = "spend-user-1";
    next();
  },
}));

const USER_ID = "spend-user-1";

// ---------------------------------------------------------------------------
// HTTP harness
// ---------------------------------------------------------------------------

let server: Server;
let baseUrl: string;

const agentRouter = (await import("./agent")).default;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api", agentRouter);
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

// ---------------------------------------------------------------------------
// Seed data
//
// The three rows straddle the month boundary on purpose:
//   - one written at 02:00 in the first day of the current month, in the
//     user's zone. It MUST count. Under a UTC month boundary it would not:
//     02:00 IST is still the previous day in UTC.
//   - one written a second before that boundary. It must NOT count.
//   - one written 60 days ago. It must NOT count.
// ---------------------------------------------------------------------------

let currentMonthRow: SeededRow;
let justBeforeMonthRow: SeededRow;
let twoMonthsAgoRow: SeededRow;
let monthStart: Date;

beforeEach(() => {
  state.now = new Date();
  state.queries.length = 0;

  // The route computes the window from its own clock; the test computes it
  // from the same instant, so the two agree unless the clock crosses a month
  // boundary mid-test (a once-a-month event).
  monthStart = currentMonthStartUtc(DEFAULT_TIME_ZONE, state.now);

  currentMonthRow = {
    id: 1,
    userId: USER_ID,
    tokensIn: 100,
    tokensOut: 50,
    costEstimateCents: 25,
    // 02:00 on the 1st, in the pinned zone.
    createdAt: new Date(monthStart.getTime() + 2.5 * 3_600_000),
  };
  justBeforeMonthRow = {
    id: 2,
    userId: USER_ID,
    tokensIn: 700,
    tokensOut: 700,
    costEstimateCents: 300,
    // One second before the boundary: the last moment of the previous month.
    createdAt: new Date(monthStart.getTime() - 1_000),
  };
  twoMonthsAgoRow = {
    id: 3,
    userId: USER_ID,
    tokensIn: 900,
    tokensOut: 900,
    costEstimateCents: 400,
    createdAt: new Date(state.now.getTime() - 60 * 86_400_000),
  };

  state.rows = [currentMonthRow, justBeforeMonthRow, twoMonthsAgoRow];
});

/** The query the fake saw against `llm_usage`. */
function usageQuery() {
  const found = state.queries.filter((q) => q.table === llmUsageTable);
  expect(found.length, "expected exactly one llm_usage query").toBe(1);
  return found[0];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/agent/usage — month-to-date, not all-time", () => {
  it("counts only the row written in the current month", async () => {
    const res = await fetch(`${baseUrl}/api/agent/usage`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      usage: {
        totalCalls: number;
        totalCostEstimateCents: number;
        spendCeilingCents: number;
      };
    };

    expect(body.usage.totalCalls).toBe(1);
  });

  it("excludes the cost of a row from 60 days ago", async () => {
    const res = await fetch(`${baseUrl}/api/agent/usage`);
    const body = (await res.json()) as {
      usage: { totalCostEstimateCents: number };
    };

    expect(body.usage.totalCostEstimateCents).toBe(
      currentMonthRow.costEstimateCents,
    );
    expect(body.usage.totalCostEstimateCents).toBeLessThan(
      currentMonthRow.costEstimateCents + twoMonthsAgoRow.costEstimateCents,
    );
  });

  it("scopes the query by month AND by owner", async () => {
    await fetch(`${baseUrl}/api/agent/usage`);
    const query = usageQuery();

    expect(query.sql).toMatch(/"user_id" = \$1/);
    expect(query.params[0]).toBe(USER_ID);
  });

  it("binds the month start as a fixed instant, never a session-zone function", async () => {
    await fetch(`${baseUrl}/api/agent/usage`);
    const query = usageQuery();

    // A database-side `date_trunc('month', now())` truncates in the
    // CONNECTION's TimeZone setting, so the boundary would move with the
    // pool. The window is computed here and bound as a parameter.
    expect(query.sql).not.toMatch(/date_trunc/);
    expect(query.sql).toMatch(/"created_at" >= \$2/);

    const bound = new Date(String(query.params[1]));
    expect(Number.isNaN(bound.getTime())).toBe(false);
    expect(bound.toISOString()).toBe(monthStart.toISOString());
    // And that instant is the start of the month that contains itself, in the
    // pinned zone.
    expect(currentMonthStartUtc(DEFAULT_TIME_ZONE, bound).toISOString()).toBe(
      bound.toISOString(),
    );
  });

  it("counts a row written at 02:00 on the 1st, in the user's own month", async () => {
    // 02:00 IST is still the previous day in UTC. A UTC month boundary would
    // have dropped this row and counted the one before the boundary instead.
    const res = await fetch(`${baseUrl}/api/agent/usage`);
    const body = (await res.json()) as { usage: { totalCalls: number } };

    expect(body.usage.totalCalls).toBe(1);
  });

  it("reports the server's monthly ceiling so the client never guesses it", async () => {
    const res = await fetch(`${baseUrl}/api/agent/usage`);
    const body = (await res.json()) as { usage: { spendCeilingCents: number } };

    expect(body.usage.spendCeilingCents).toBe(MONTHLY_SPEND_CEILING_CENTS);
    expect(body.usage.spendCeilingCents).toBe(500);
  });
});

describe("the agent engine's spend alert — month-to-date, not all-time", () => {
  const PROVIDER_ENV_KEYS = [
    "LITELLM_BASE_URL",
    "LITELLM_API_KEY",
    "LITELLM_MODEL",
    "GEMINI_API_KEY",
    "GEMINI_MODEL",
    "NVIDIA_NIM_API_KEY",
    "NVIDIA_NIM_MODEL",
    "GROQ_API_KEY",
    "GROQ_MODEL",
    "OPENROUTER_API_KEY",
    "OPENROUTER_MODEL",
  ];
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of PROVIDER_ENV_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of PROVIDER_ENV_KEYS) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
  });

  it("reports this month's spend, not the all-time total", async () => {
    const { runAgentConversation } = await import("../lib/agent/engine");
    const result = await runAgentConversation({
      userId: USER_ID,
      message: "what is due today?",
    });

    expect(result.spendAlert?.totalMonthCostCents).toBe(
      currentMonthRow.costEstimateCents,
    );
  });

  it("scopes the spend query by month AND by owner", async () => {
    const { runAgentConversation } = await import("../lib/agent/engine");
    await runAgentConversation({
      userId: USER_ID,
      message: "what is due today?",
    });

    const query = usageQuery();
    expect(query.sql).toMatch(/"user_id" = \$1/);
    expect(query.sql).not.toMatch(/date_trunc/);
    expect(query.sql).toMatch(/"created_at" >= \$2/);
    const bound = new Date(String(query.params[1]));
    expect(bound.toISOString()).toBe(monthStart.toISOString());
  });
});

describe("GET /api/agent/actions — `limit` query param", () => {
  beforeEach(() => {
    state.actionRows = Array.from({ length: 7 }, (_, i) => ({
      id: i + 1,
      userId: USER_ID,
      createdAt: new Date(),
    }));
  });

  it("returns at most `limit` actions", async () => {
    const res = await fetch(`${baseUrl}/api/agent/actions?limit=5`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { actions: unknown[] };
    expect(body.actions.length).toBeLessThanOrEqual(5);
  });
});
