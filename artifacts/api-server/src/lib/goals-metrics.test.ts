import { describe, expect, it, vi } from "vitest";

vi.mock("@workspace/db", () => ({
  focusSessionsTable: {
    id: "id",
    userId: "userId",
    taskId: "taskId",
    elapsedMinutes: "elapsedMinutes",
    status: "status",
    startedAt: "startedAt",
  },
  tasksTable: {
    id: "id",
    userId: "userId",
    projectId: "projectId",
    status: "status",
    dueAt: "dueAt",
    completedAt: "completedAt",
  },
  taskTagsTable: {
    taskId: "taskId",
    tagId: "tagId",
  },
  projectsTable: {
    id: "id",
    name: "name",
  },
  tagsTable: {
    id: "id",
    name: "name",
  },
  monthlyGoalsTable: {},
  monthlyGoalSnapshotsTable: {},
  notificationSettingsTable: {
    userId: "userId",
    timeZone: "timeZone",
  },
}));

import {
  computeGoalActual,
  isScopeDeleted,
} from "./goals-metrics";

describe("goals-metrics invariants", () => {
  describe("isScopeDeleted", () => {
    it("flags project scope with null project ID as deleted", () => {
      expect(isScopeDeleted("project", null)).toBe(true);
      expect(isScopeDeleted("project", undefined)).toBe(true);
    });

    it("accepts valid project scope with ID", () => {
      expect(isScopeDeleted("project", 42)).toBe(false);
    });

    it("flags tag scope with null tag ID as deleted", () => {
      expect(isScopeDeleted("tag", null, null)).toBe(true);
      expect(isScopeDeleted("tag", null, undefined)).toBe(true);
    });

    it("accepts valid tag scope with ID", () => {
      expect(isScopeDeleted("tag", null, 17)).toBe(false);
    });

    it("always treats global scope as not deleted", () => {
      expect(isScopeDeleted("global", null, null)).toBe(false);
      expect(isScopeDeleted("global")).toBe(false);
    });
  });

  describe("computeGoalActual with scope deletion", () => {
    it("returns actual 0 and scopeDeleted true when scope is missing", async () => {
      const mockTx = {
        select: vi.fn(),
      };
      const result = await computeGoalActual(
        mockTx,
        "user_123",
        {
          metric: "focus_minutes",
          scopeKind: "project",
          scopeProjectId: null,
        },
        { start: new Date("2026-10-01"), end: new Date("2026-11-01") },
        "Asia/Kolkata",
      );

      expect(result.actual).toBe(0);
      expect(result.scopeDeleted).toBe(true);
      expect(result.scopeLabel).toBeNull();
      // Ensure no DB queries were executed
      expect(mockTx.select).not.toHaveBeenCalled();
    });
  });
});
