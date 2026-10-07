import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  CredentialCryptoError,
  decryptCredential,
  encryptCredential,
  isCredentialCryptoConfigured,
  keyHint,
} from "./credential-crypto";

/**
 * AES-256-GCM envelope tests.
 *
 * The module reads CREDENTIAL_ENCRYPTION_KEY at call time (not module load) so
 * these can exercise the unconfigured path, which is exactly the state the
 * agent has to fail loudly in rather than fall back to a greeting.
 */

const VALID_KEY_B64 = Buffer.alloc(32, 7).toString("base64");
const OTHER_KEY_B64 = Buffer.alloc(32, 9).toString("base64");

let originalKey: string | undefined;

beforeEach(() => {
  originalKey = process.env.CREDENTIAL_ENCRYPTION_KEY;
  delete process.env.CREDENTIAL_ENCRYPTION_KEY;
});

afterEach(() => {
  if (originalKey === undefined) delete process.env.CREDENTIAL_ENCRYPTION_KEY;
  else process.env.CREDENTIAL_ENCRYPTION_KEY = originalKey;
});

describe("unconfigured key", () => {
  it("refuses to encrypt rather than silently using a weak default", () => {
    expect(() => encryptCredential("sk-secret")).toThrow(CredentialCryptoError);
    expect(() => encryptCredential("sk-secret")).toThrow(/CREDENTIAL_ENCRYPTION_KEY is not set/);
  });

  it("reports itself unconfigured", () => {
    expect(isCredentialCryptoConfigured()).toBe(false);
  });

  it("rejects an empty string key (the bug that hid this whole feature)", () => {
    // The .env in this repo shipped GEMINI_API_KEY= and LLM_FALLBACK_KEY=
    // blank, which is why the agent silently returned a greeting for months.
    process.env.CREDENTIAL_ENCRYPTION_KEY = "";
    expect(isCredentialCryptoConfigured()).toBe(false);
    expect(() => encryptCredential("x")).toThrow(/is not set/);
  });

  it("rejects a whitespace-only key", () => {
    process.env.CREDENTIAL_ENCRYPTION_KEY = "   ";
    expect(isCredentialCryptoConfigured()).toBe(false);
  });

  it("rejects a key of the wrong length", () => {
    process.env.CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(16, 1).toString("base64");
    expect(() => encryptCredential("x")).toThrow(/must decode to 32 bytes/);
  });

  it("accepts a hex-encoded key as well as base64", () => {
    process.env.CREDENTIAL_ENCRYPTION_KEY = "ab".repeat(32);
    expect(isCredentialCryptoConfigured()).toBe(true);
    const envelope = encryptCredential("sk-hex");
    expect(decryptCredential(envelope)).toBe("sk-hex");
  });
});

describe("round trip", () => {
  beforeEach(() => {
    process.env.CREDENTIAL_ENCRYPTION_KEY = VALID_KEY_B64;
  });

  it("decrypts what it encrypted", () => {
    const envelope = encryptCredential("sk-proj-abc123DEF");
    expect(decryptCredential(envelope)).toBe("sk-proj-abc123DEF");
  });

  it("emits a versioned envelope", () => {
    const envelope = encryptCredential("sk-x");
    expect(envelope.split(":")).toHaveLength(4);
    expect(envelope.startsWith("v1:")).toBe(true);
  });

  it("never stores the plaintext in the envelope", () => {
    const envelope = encryptCredential("sk-super-secret-value");
    expect(envelope).not.toContain("super-secret");
    expect(envelope).not.toContain("sk-super");
  });

  it("uses a fresh IV per call, so identical keys do not produce identical rows", () => {
    const a = encryptCredential("same-key");
    const b = encryptCredential("same-key");
    expect(a).not.toBe(b);
    // Both still decrypt correctly.
    expect(decryptCredential(a)).toBe("same-key");
    expect(decryptCredential(b)).toBe("same-key");
  });

  it("handles empty and unicode payloads", () => {
    expect(decryptCredential(encryptCredential(""))).toBe("");
    expect(decryptCredential(encryptCredential("clé-🔑-देखो"))).toBe("clé-🔑-देखो");
  });

  it("handles a large payload", () => {
    const big = "x".repeat(100_000);
    expect(decryptCredential(encryptCredential(big))).toBe(big);
  });
});

describe("tamper detection", () => {
  beforeEach(() => {
    process.env.CREDENTIAL_ENCRYPTION_KEY = VALID_KEY_B64;
  });

  it("rejects a modified ciphertext payload", () => {
    const [v, iv, tag, payload] = encryptCredential("sk-original").split(":");
    const flipped = Buffer.from(payload, "base64");
    flipped[0] ^= 0xff;
    const tampered = [v, iv, tag, flipped.toString("base64")].join(":");

    expect(() => decryptCredential(tampered)).toThrow(/could not be decrypted/);
  });

  it("rejects a modified auth tag", () => {
    const [v, iv, tag, payload] = encryptCredential("sk-original").split(":");
    const flipped = Buffer.from(tag, "base64");
    flipped[0] ^= 0xff;
    expect(() =>
      decryptCredential([v, iv, flipped.toString("base64"), payload].join(":")),
    ).toThrow(/could not be decrypted/);
  });

  it("rejects a swapped IV", () => {
    const [v, iv, tag, payload] = encryptCredential("sk-a").split(":");
    const other = encryptCredential("sk-b").split(":");
    expect(() => decryptCredential([v, other[1], tag, payload].join(":"))).toThrow(
      /could not be decrypted/,
    );
  });

  it("rejects a ciphertext decrypted under a different key", () => {
    const envelope = encryptCredential("sk-secret");
    process.env.CREDENTIAL_ENCRYPTION_KEY = OTHER_KEY_B64;
    expect(() => decryptCredential(envelope)).toThrow(/could not be decrypted/);
  });

  it("rejects a truncated envelope", () => {
    const envelope = encryptCredential("sk-x");
    expect(() => decryptCredential(envelope.slice(0, 20))).toThrow(
      /Malformed credential envelope/,
    );
  });

  it("rejects an unknown envelope version", () => {
    const [v, iv, tag, payload] = encryptCredential("sk-x").split(":");
    expect(() =>
      decryptCredential(["v9", iv, tag, payload].join(":")),
    ).toThrow(/Unsupported credential envelope version/);
  });

  it("rejects a wrong-length IV", () => {
    const [, , tag, payload] = encryptCredential("sk-x").split(":");
    expect(() =>
      decryptCredential(["v1", Buffer.alloc(4).toString("base64"), tag, payload].join(":")),
    ).toThrow(/Malformed credential IV/);
  });

  it("never returns partial plaintext on failure", () => {
    const envelope = encryptCredential("sk-original-value");
    const [, , , payload] = envelope.split(":");
    const garbage = Buffer.from("totally different data here", "utf8").toString("base64");
    let result: string | null = null;
    try {
      result = decryptCredential(["v1", envelope.split(":")[1], envelope.split(":")[2], garbage].join(":"));
    } catch {
      result = null;
    }
    expect(result).toBeNull();
    expect(payload).not.toBe(garbage);
  });
});

describe("keyHint", () => {
  it("returns the last four characters", () => {
    expect(keyHint("sk-proj-abc123DEF")).toBe("3DEF");
  });

  it("returns the whole value when shorter than the mask", () => {
    expect(keyHint("abc")).toBe("abc");
  });

  it("trims before slicing so pasted whitespace does not skew the hint", () => {
    expect(keyHint("  sk-proj-abc123DEF  ")).toBe("3DEF");
  });

  it("returns empty for an empty key", () => {
    expect(keyHint("")).toBe("");
    expect(keyHint("   ")).toBe("");
  });
});