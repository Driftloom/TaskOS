import { describe, expect, it } from "vitest";
import { extractMetadataFromHtml, isPrivateOrForbiddenHost, parseUrlMetadata } from "./url-metadata";

describe("isPrivateOrForbiddenHost", () => {
  it("rejects localhost and loopback addresses", () => {
    expect(isPrivateOrForbiddenHost("localhost")).toBe(true);
    expect(isPrivateOrForbiddenHost("127.0.0.1")).toBe(true);
    expect(isPrivateOrForbiddenHost("::1")).toBe(true);
  });

  it("rejects AWS/cloud metadata address", () => {
    expect(isPrivateOrForbiddenHost("169.254.169.254")).toBe(true);
  });

  it("rejects private RFC1918 subnets", () => {
    expect(isPrivateOrForbiddenHost("10.0.0.1")).toBe(true);
    expect(isPrivateOrForbiddenHost("172.16.0.5")).toBe(true);
    expect(isPrivateOrForbiddenHost("172.31.255.255")).toBe(true);
    expect(isPrivateOrForbiddenHost("192.168.1.1")).toBe(true);
  });

  it("allows standard public internet hostnames", () => {
    expect(isPrivateOrForbiddenHost("github.com")).toBe(false);
    expect(isPrivateOrForbiddenHost("linear.app")).toBe(false);
    expect(isPrivateOrForbiddenHost("docs.google.com")).toBe(false);
  });
});

describe("extractMetadataFromHtml", () => {
  it("extracts html title tag", () => {
    const html = `<!DOCTYPE html><html><head><title>My Task Document - Docs</title></head><body>Hello</body></html>`;
    expect(extractMetadataFromHtml(html, "https://docs.google.com/d/123")).toEqual({
      url: "https://docs.google.com/d/123",
      title: "My Task Document - Docs",
      domain: "docs.google.com",
    });
  });

  it("extracts og:title when available", () => {
    const html = `<html><head><meta property="og:title" content="Pull Request #42: Feature" /><title>PR 42</title></head></html>`;
    expect(extractMetadataFromHtml(html, "https://github.com/repo/pr/42")).toEqual({
      url: "https://github.com/repo/pr/42",
      title: "Pull Request #42: Feature",
      domain: "github.com",
    });
  });

  it("falls back to domain and path when no title tag exists", () => {
    const html = `<html><body>No head or title</body></html>`;
    expect(extractMetadataFromHtml(html, "https://example.com/blog/article")).toEqual({
      url: "https://example.com/blog/article",
      title: "example.com/blog/article",
      domain: "example.com",
    });
  });
});
