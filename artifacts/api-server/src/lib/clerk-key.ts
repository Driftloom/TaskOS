/**
 * Fail-fast validation for Clerk keys.
 *
 * `clerkMiddleware` throws per-request when a key is missing or malformed, so
 * a configuration mistake turned every route into an opaque 500 with no signal
 * at boot. This converts that into one clear message at startup.
 *
 * Both keys are required: the publishable key identifies the instance and the
 * secret key is what lets the middleware verify a session token. A missing
 * secret key is the easier one to overlook because it is server-only and never
 * appears in the frontend bundle.
 *
 * Format only. Deliberately does not verify against Clerk, which would require
 * a network call at boot.
 */

const PK = /^pk_(test|live)_[A-Za-z0-9_-]{20,}$/;
const SK = /^sk_(test|live)_[A-Za-z0-9_-]{20,}$/;

export interface ClerkKeyOptions {
  /** Skips validation entirely (used by the HTTP contract tests). */
  allowMissing?: boolean;
  /** Enforces strict rejection of placeholders even in development mode. */
  strict?: boolean;
}

export function extractClerkInstance(publishableKey: string | undefined): string | null {
  if (!publishableKey || !PK.test(publishableKey)) return null;
  try {
    const raw = publishableKey.split("_")[2];
    if (!raw) return null;
    const decoded = Buffer.from(raw, "base64").toString("utf-8");
    return decoded.replace(/\$$/, "");
  } catch {
    return null;
  }
}

export function assertClerkKeysUsable(
  publishableKey: string | undefined,
  secretKey: string | undefined,
  opts: ClerkKeyOptions = {},
): void {
  const problems: string[] = [];
  let isPlaceholder = false;

  if (!publishableKey) {
    problems.push(
      "CLERK_PUBLISHABLE_KEY is not set (expected pk_test_... or pk_live_...)",
    );
  } else if (!PK.test(publishableKey)) {
    problems.push("CLERK_PUBLISHABLE_KEY is malformed (expected pk_test_... or pk_live_...)");
  }

  if (!secretKey) {
    problems.push(
      "CLERK_SECRET_KEY is not set (expected sk_test_... or sk_live_...)",
    );
  } else if (!SK.test(secretKey)) {
    problems.push("CLERK_SECRET_KEY is malformed (expected sk_test_... or sk_live_...)");
  } else {
    const raw = secretKey.split("_")[2];
    if (raw === "MTwfGisZTkhQ3xNOiNzPIdZQj11FuTzBR14okxK5Ay") {
      isPlaceholder = true;
      problems.push(
        "CLERK_SECRET_KEY is the unconfigured template placeholder ('MTwfGis...'). Paste your actual Secret Key from Clerk dashboard or run 'npx clerk env pull --file .env'.",
      );
    }
  }

  if (problems.length === 0) return;
  if (opts.allowMissing) return;

  const instance = extractClerkInstance(publishableKey) ?? "unknown instance";

  // In non-strict dev mode with valid syntax but template placeholder, print an actionable banner without crashing
  const isProd = process.env.NODE_ENV === "production";
  if (isPlaceholder && problems.length === 1 && !opts.strict && !isProd) {
    console.error(
      `\n========================================================================\n` +
        `🚨 CLERK AUTHENTICATION WARNING (DEVELOPMENT)\n` +
        `   Target Instance: ${instance}\n` +
        `   CLERK_SECRET_KEY is the unconfigured template placeholder ('MTwfGis...').\n` +
        `   Requests to protected routes will be rejected with 401 Unauthorized!\n` +
        `   👉 To fix: Run 'npx clerk env pull --file .env' or copy Secret Key from:\n` +
        `      https://dashboard.clerk.com/last-active?path=api-keys\n` +
        `========================================================================\n`,
    );
    return;
  }

  throw new Error(
    `Clerk is not configured, so the server cannot authenticate any request.\n` +
      `Target instance: ${instance}\n` +
      problems.map((p) => `  - ${p}`).join("\n") +
      `\n\nRefusing to start: without valid keys, incoming authenticated requests fail with 401 Unauthorized.\n` +
      `Fix with one of:\n` +
      `  npx clerk env pull --file .env   # writes live keys from Clerk workspace\n` +
      `  copy Secret Key from https://dashboard.clerk.com/last-active?path=api-keys\n` +
      `  (CLERK_SECRET_KEY is server-only and is never exposed to the browser)`,
  );
}
