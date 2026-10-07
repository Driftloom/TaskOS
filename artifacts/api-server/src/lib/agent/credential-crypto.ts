import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

/**
 * Authenticated encryption for user-supplied LLM provider credentials.
 *
 * ## Why encryption at all
 *
 * The Telegram bot token is stored in plaintext JSONB, which was already a leak
 * (see lib/memory-sanitize.ts). A provider API key is a step further: it is
 * billed, it can be scoped to a project with a spending limit, and unlike the
 * bot token there is no "revoke by re-pasting" recovery if it leaks. Anything
 * holding `DATABASE_URL` can read every row, so the row itself must not be the
 * secret.
 *
 * ## Cipher
 *
 * AES-256-GCM. Authenticated, so tampering is detected on decrypt rather than
 * yielding garbage plaintext. A fresh 12-byte IV per encryption — GCM reuses the
 * IV catastrophically under the same key, so it must never be derived from the
 * plaintext or the key.
 *
 * ## Envelope
 *
 * `v1:<iv>:<tag>:<payload>`, all base64. The version prefix exists so a future
 * key rotation or algorithm change can decrypt `v1` while writing `v2`.
 */

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const KEY_BYTES = 32;
const ENVELOPE_VERSION = "v1";
const ENV_VAR = "CREDENTIAL_ENCRYPTION_KEY";

/** Thrown for every failure mode, so callers never surface crypto internals. */
export class CredentialCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CredentialCryptoError";
  }
}

/**
 * Reads and validates the master key at call time rather than at module load.
 *
 * Module-load validation would make importing this file — including from a test
 * — depend on the environment, and a missing var would surface as an opaque
 * failure somewhere else entirely.
 */
function loadKey(): Buffer {
  const raw = process.env[ENV_VAR];
  if (!raw || raw.trim().length === 0) {
    throw new CredentialCryptoError(
      `${ENV_VAR} is not set. Generate one with: openssl rand -base64 32`,
    );
  }

  // Accept base64 (what `openssl rand -base64 32` emits) and fall back to hex,
  // because both are what people paste.
  let key: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(raw.trim())) {
    key = Buffer.from(raw.trim(), "hex");
  } else {
    key = Buffer.from(raw.trim(), "base64");
  }

  if (key.length !== KEY_BYTES) {
    throw new CredentialCryptoError(
      `${ENV_VAR} must decode to ${KEY_BYTES} bytes (got ${key.length}). ` +
        "Regenerate with: openssl rand -base64 32",
    );
  }

  return key;
}

/** True when the master key is present and well-formed. */
export function isCredentialCryptoConfigured(): boolean {
  try {
    loadKey();
    return true;
  } catch {
    return false;
  }
}

/**
 * Last few characters of a key, safe to render in the UI.
 *
 * Shows *which* key is stored (so Gemini and Groq are distinguishable at a
 * glance) without revealing it. The migration caps the column at 8 characters
 * and the mask prefix is added at render time, not stored.
 */
export function keyHint(apiKey: string): string {
  const trimmed = apiKey.trim();
  if (trimmed.length === 0) return "";
  return trimmed.slice(-4);
}

/** Encrypts a credential. Returns a `v1:` envelope safe to persist. */
export function encryptCredential(plaintext: string): string {
  const key = loadKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    ENVELOPE_VERSION,
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

/**
 * Decrypts a `v1:` envelope.
 *
 * Throws on a bad key, a bad envelope, or a failed authentication tag. It never
 * returns partial plaintext: a caller that ignored the throw would otherwise
 * send garbage to a provider and get a confusing 401 instead of a clear error.
 */
export function decryptCredential(envelope: string): string {
  const key = loadKey();

  const parts = envelope.split(":");
  if (parts.length !== 4) {
    throw new CredentialCryptoError("Malformed credential envelope");
  }

  const [version, ivB64, tagB64, payloadB64] = parts;
  if (version !== ENVELOPE_VERSION) {
    throw new CredentialCryptoError(
      `Unsupported credential envelope version: ${version}`,
    );
  }

  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const payload = Buffer.from(payloadB64, "base64");

  if (iv.length !== IV_BYTES) {
    throw new CredentialCryptoError("Malformed credential IV");
  }

  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(payload), decipher.final()]).toString(
      "utf8",
    );
  } catch {
    // Wrong key, or the row was tampered with. Indistinguishable by design —
    // saying which would leak information about the stored ciphertext.
    throw new CredentialCryptoError(
      "Credential could not be decrypted: wrong CREDENTIAL_ENCRYPTION_KEY, " +
        "or the stored value was modified",
    );
  }
}