import { describe, expect, it } from "vitest";
import { CreateTaskFileBody } from "@workspace/api-zod";

describe("contract — file link shapes", () => {
  it("accepts https links with optional names", () => {
    expect(
      CreateTaskFileBody.safeParse({ url: "https://example.com/a.pdf" }).success,
    ).toBe(true);
    expect(
      CreateTaskFileBody.safeParse({ url: "http://x.co", name: "Spec" }).success,
    ).toBe(true);
  });
  it("rejects non-http urls and bad names", () => {
    expect(CreateTaskFileBody.safeParse({ url: "ftp://x.co/f" }).success).toBe(
      false,
    );
    expect(CreateTaskFileBody.safeParse({ url: "not a url" }).success).toBe(
      false,
    );
    expect(
      CreateTaskFileBody.safeParse({ url: "https://x.co", name: "" }).success,
    ).toBe(false);
  });
});
