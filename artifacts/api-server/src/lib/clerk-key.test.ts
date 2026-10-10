import { describe, it, expect } from "vitest";
import { assertClerkKeysUsable } from "./clerk-key";

/**
 * Guards the fail-fast behaviour added after discovering that a missing
 * CLERK_SECRET_KEY produced an opaque 500 on every route.
 */

const PK = "pk_test_ZXhhbXBsZS5jbGVyay5hY2NvdW50cy5kZXYk";
const SK = "sk_test_ZXhhbXBsZS5jbGVyay5hY2NvdW50cy5kZXYk";

describe("assertClerkKeysUsable", () => {
  it("accepts a well-formed pair", () => {
    expect(() => assertClerkKeysUsable(PK, SK)).not.toThrow();
  });

  it("rejects a missing publishable key", () => {
    expect(() => assertClerkKeysUsable(undefined, SK)).toThrow(/CLERK_PUBLISHABLE_KEY is not set/);
  });

  it("rejects a missing secret key and names the exact variable", () => {
    // The regression this exists for: the secret is server-only, so it is the
    // easy one to forget.
    expect(() => assertClerkKeysUsable(PK, undefined)).toThrow(/CLERK_SECRET_KEY is not set/);
  });

  it("rejects a malformed publishable key", () => {
    expect(() => assertClerkKeysUsable("not-a-key", SK)).toThrow(/malformed/);
  });

  it("rejects a secret key that is actually a publishable key", () => {
    expect(() => assertClerkKeysUsable(PK, PK)).toThrow(/CLERK_SECRET_KEY is malformed/);
  });

  it("reports every problem at once rather than one at a time", () => {
    let message = "";
    try {
      assertClerkKeysUsable(undefined, undefined);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/CLERK_PUBLISHABLE_KEY/);
    expect(message).toMatch(/CLERK_SECRET_KEY/);
  });

  it("can be bypassed explicitly for tests", () => {
    expect(() =>
      assertClerkKeysUsable(undefined, undefined, { allowMissing: true }),
    ).not.toThrow();
  });
});
