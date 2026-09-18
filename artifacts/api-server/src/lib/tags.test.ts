import { describe, expect, it } from "vitest";
import {
  CreateProjectBody,
  CreateTagBody,
  CreateTaskBody,
} from "@workspace/api-zod";
import { normalizeTagName } from "./tags";

describe("normalizeTagName", () => {
  it("trims, lowercases, collapses whitespace", () => {
    expect(normalizeTagName("  Work  ")).toBe("work");
    expect(normalizeTagName("Deep   Work")).toBe("deep work");
    expect(normalizeTagName("HOME")).toBe("home");
  });
  it("rejects blank and overlong names", () => {
    expect(normalizeTagName("")).toBeNull();
    expect(normalizeTagName("   ")).toBeNull();
    expect(normalizeTagName("x".repeat(41))).toBeNull();
    expect(normalizeTagName("x".repeat(40))).toBe("x".repeat(40));
  });
});

describe("contract — projects/tags shapes", () => {
  it("project color boundary", () => {
    expect(
      CreateProjectBody.safeParse({ name: "p", color: "#ff9500" }).success,
    ).toBe(true);
    expect(CreateProjectBody.safeParse({ name: "p" }).success).toBe(true);
    expect(CreateProjectBody.safeParse({ name: "p", color: "red" }).success).toBe(
      false,
    );
    expect(CreateProjectBody.safeParse({ name: "" }).success).toBe(false);
  });
  it("tag name boundary", () => {
    expect(CreateTagBody.safeParse({ name: "work" }).success).toBe(true);
    expect(CreateTagBody.safeParse({ name: "" }).success).toBe(false);
  });
  it("task filing fields ride along", () => {
    const p = CreateTaskBody.safeParse({
      title: "x",
      projectId: 3,
      tagIds: [1, 2],
    });
    expect(p.success).toBe(true);
  });
});
