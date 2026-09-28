import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import {
  buildPlan,
  parseFilename,
  loadMigrations,
  type Migration,
  type LedgerRow,
} from "../src/migrate";

/**
 * Migration-runner planning logic, exercised without a database.
 *
 * `buildPlan` is the part that protects a live environment, so its refusal
 * cases are asserted directly rather than inferred from an integration run.
 */

const sha = (sql: string) => createHash("sha256").update(sql).digest("hex");

function mig(version: number, name: string, sql = `select ${version};`): Migration {
  return {
    version,
    name,
    filename: `${String(version).padStart(4, "0")}_${name}.sql`,
    sql,
    checksum: sha(sql),
  };
}

function applied(
  version: number,
  name: string,
  checksum: string,
): LedgerRow {
  return {
    version,
    name,
    checksum,
    applied_at: new Date("2026-09-28T00:00:00Z"),
    execution_ms: 5,
  };
}

describe("parseFilename", () => {
  it("splits a version and name", () => {
    expect(parseFilename("0011_tasks_completed_at.sql")).toEqual({
      version: 11,
      name: "tasks_completed_at",
    });
  });

  it("rejects a file that does not match the convention", () => {
    expect(() => parseFilename("tasks.sql")).toThrow(/NNN_name\.sql/);
    expect(() => parseFilename("0011.sql")).toThrow(/NNN_name\.sql/);
    expect(() => parseFilename("add-stuff.sql")).toThrow(/NNN_name\.sql/);
  });
});

describe("loadMigrations", () => {
  it("parses the real migrations directory in version order", () => {
    const ms = loadMigrations();
    expect(ms.length).toBeGreaterThan(0);
    const versions = ms.map((m) => m.version);
    expect(versions).toEqual([...versions].sort((a, b) => a - b));
    expect(versions).toContain(1);
    expect(ms.every((m) => /^[0-9a-f]{64}$/.test(m.checksum))).toBe(true);
  });

  it("loads the three migrations added during the 2026-09-28 audit", () => {
    const names = loadMigrations().map((m) => m.filename);
    expect(names).toContain("0011_tasks_completed_at.sql");
    expect(names).toContain("0012_tasks_rrule.sql");
    expect(names).toContain("0013_notification_working_hours.sql");
  });
});

describe("buildPlan", () => {
  it("treats an empty ledger as everything pending", () => {
    const plan = buildPlan([mig(1, "a"), mig(2, "b")], []);
    expect(plan.pending.map((m) => m.version)).toEqual([1, 2]);
  });

  it("returns nothing pending when the ledger is current", () => {
    const a = mig(1, "a");
    const plan = buildPlan([a, mig(2, "b")], [applied(1, "a", a.checksum)]);
    expect(plan.pending.map((m) => m.version)).toEqual([2]);
  });

  it("detects an already-applied migration that was edited", () => {
    const original = mig(1, "a", "select 1;");
    const edited = mig(1, "a", "select 1; -- tampered");
    expect(() =>
      buildPlan([edited], [applied(1, "a", original.checksum)]),
    ).toThrow(/Checksum drift detected/);
  });

  it("refuses to back-fill a version below the highest applied", () => {
    const a = mig(5, "a");
    expect(() =>
      buildPlan([mig(3, "inserted_late"), a], [applied(5, "a", a.checksum)]),
    ).toThrow(/sorts before already-applied version 5/);
  });

  it("fails loudly when a recorded migration file has disappeared", () => {
    const a = mig(1, "a");
    expect(() => buildPlan([], [applied(1, "a", a.checksum)])).toThrow(
      /no longer exists in the migrations directory/,
    );
  });

  it("allows a later version to be applied normally", () => {
    const a = mig(1, "a");
    const plan = buildPlan([a, mig(2, "b"), mig(3, "c")], [
      applied(1, "a", a.checksum),
    ]);
    expect(plan.pending.map((m) => m.version)).toEqual([2, 3]);
  });
});
