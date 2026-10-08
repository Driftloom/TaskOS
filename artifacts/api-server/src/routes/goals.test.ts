import { describe, expect, it } from "vitest";
import {
  CarryGoalBody,
  CreateGoalBody,
  ListGoalsQueryParams,
  UpdateGoalBody,
} from "@workspace/api-zod";

describe("goals API validation schemas", () => {
  describe("ListGoalsQueryParams", () => {
    it("accepts valid YYYY-MM months", () => {
      expect(ListGoalsQueryParams.safeParse({ month: "2026-10" }).success).toBe(true);
      expect(ListGoalsQueryParams.safeParse({ month: "2025-01" }).success).toBe(true);
      expect(ListGoalsQueryParams.safeParse({}).success).toBe(true);
    });

    it("rejects malformed month formats", () => {
      expect(ListGoalsQueryParams.safeParse({ month: "2026-1" }).success).toBe(false);
      expect(ListGoalsQueryParams.safeParse({ month: "2026-13" }).success).toBe(false);
      expect(ListGoalsQueryParams.safeParse({ month: "October" }).success).toBe(false);
    });
  });

  describe("CreateGoalBody", () => {
    it("validates a well-formed global goal", () => {
      const parsed = CreateGoalBody.safeParse({
        title: "Deep focus target",
        month: "2026-10",
        metric: "focus_minutes",
        target: 1200,
        scopeKind: "global",
      });
      expect(parsed.success).toBe(true);
    });

    it("validates a project-scoped goal", () => {
      const parsed = CreateGoalBody.safeParse({
        title: "Cadence project tasks",
        month: "2026-10",
        metric: "tasks_completed",
        target: 20,
        scopeKind: "project",
        scopeProjectId: 4,
      });
      expect(parsed.success).toBe(true);
    });

    it("rejects empty title, negative target, or invalid metric", () => {
      expect(
        CreateGoalBody.safeParse({
          title: "",
          month: "2026-10",
          metric: "focus_minutes",
          target: 10,
        }).success,
      ).toBe(false);

      expect(
        CreateGoalBody.safeParse({
          title: "Valid title",
          month: "2026-10",
          metric: "focus_minutes",
          target: 0,
        }).success,
      ).toBe(false);

      expect(
        CreateGoalBody.safeParse({
          title: "Valid title",
          month: "2026-10",
          metric: "invalid_metric",
          target: 10,
        }).success,
      ).toBe(false);
    });
  });

  describe("UpdateGoalBody", () => {
    it("accepts valid partial updates", () => {
      expect(UpdateGoalBody.safeParse({ title: "Updated intention" }).success).toBe(true);
      expect(UpdateGoalBody.safeParse({ target: 50 }).success).toBe(true);
      expect(
        UpdateGoalBody.safeParse({ title: "Both fields", target: 100 }).success,
      ).toBe(true);
    });

    it("rejects invalid target values", () => {
      expect(UpdateGoalBody.safeParse({ target: 0 }).success).toBe(false);
      expect(UpdateGoalBody.safeParse({ target: -5 }).success).toBe(false);
    });
  });

  describe("CarryGoalBody", () => {
    it("accepts optional overrides", () => {
      expect(CarryGoalBody.safeParse({}).success).toBe(true);
      expect(CarryGoalBody.safeParse({ month: "2026-11" }).success).toBe(true);
      expect(
        CarryGoalBody.safeParse({
          month: "2026-11",
          title: "Carried forward focus",
          target: 1500,
        }).success,
      ).toBe(true);
    });
  });
});
