import { describe, expect, it } from "vitest";
import { formatTsQuery } from "./search-query";

describe("formatTsQuery", () => {
  it("formats standard keywords into prefix query", () => {
    expect(formatTsQuery("buy milk")).toBe("'buy':* & 'milk':*");
  });

  it("sanitizes dangerous punctuation and operators", () => {
    expect(formatTsQuery("test & * | ! ' \" ( ) \\ dangerous")).toBe(
      "'test':* & 'dangerous':*",
    );
  });

  it("handles single word prefix search", () => {
    expect(formatTsQuery("project")).toBe("'project':*");
  });

  it("returns null for empty or all-punctuation input", () => {
    expect(formatTsQuery("")).toBeNull();
    expect(formatTsQuery("   ")).toBeNull();
    expect(formatTsQuery("! & * |")).toBeNull();
  });
});
