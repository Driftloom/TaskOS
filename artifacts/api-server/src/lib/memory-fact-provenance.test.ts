import { describe, it, expect } from "vitest";
import {
  UNMEASURED_CONFIDENCE,
  USER_AUTHORED_KEY,
  USER_NOTE_KEY,
  isUserAuthoredValue,
} from "./memory-fact-provenance";

describe("isUserAuthoredValue", () => {
  it("is true only for an exact boolean true", () => {
    expect(isUserAuthoredValue({ [USER_AUTHORED_KEY]: true })).toBe(true);
    expect(isUserAuthoredValue({ [USER_AUTHORED_KEY]: false })).toBe(false);
    expect(isUserAuthoredValue({ [USER_AUTHORED_KEY]: "true" })).toBe(false);
    expect(isUserAuthoredValue({ [USER_AUTHORED_KEY]: 1 })).toBe(false);
    expect(isUserAuthoredValue({ [USER_AUTHORED_KEY]: null })).toBe(false);
  });

  it("is false for a value with no marker at all", () => {
    expect(isUserAuthoredValue({})).toBe(false);
    expect(isUserAuthoredValue({ userNote: "a note" })).toBe(false);
    expect(isUserAuthoredValue(undefined)).toBe(false);
    expect(isUserAuthoredValue(null)).toBe(false);
  });

  it("is false for a non-object value", () => {
    expect(isUserAuthoredValue("createdByUser")).toBe(false);
    expect(isUserAuthoredValue(42)).toBe(false);
    expect(isUserAuthoredValue(true)).toBe(false);
    expect(isUserAuthoredValue([{ [USER_AUTHORED_KEY]: true }])).toBe(false);
  });

  it("reads the marker alongside a user's own note", () => {
    const value = {
      [USER_NOTE_KEY]: "I sprint on Sunday mornings.",
      [USER_AUTHORED_KEY]: true,
    };
    expect(isUserAuthoredValue(value)).toBe(true);
  });
});

describe("UNMEASURED_CONFIDENCE", () => {
  it("is the absence of a measurement, not a score", () => {
    // `memory_facts.confidence` is NOT NULL with CHECK (confidence BETWEEN 0
    // AND 100), so "not measured" cannot be stored as NULL. 0 is the column's
    // own lower bound and the contract's `minimum: 0`.
    expect(UNMEASURED_CONFIDENCE).toBe(0);
    expect(UNMEASURED_CONFIDENCE).toBeGreaterThanOrEqual(0);
    expect(UNMEASURED_CONFIDENCE).toBeLessThanOrEqual(100);
  });
});
