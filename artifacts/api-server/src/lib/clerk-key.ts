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
}

export function assertClerkKeysUsable(
  publishableKey: string | undefined,
  secretKey: string | undefined,
  opts: ClerkKeyOptions = {},
): void {
  const problems: string[] = [];

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
  }

  if (problems.length === 0) return;
  if (opts.allowMissing) return;

  throw new Error(
    `Clerk is not configured, so the server cannot authenticate any request.\n` +
      problems.map((p) => `  - ${p}`).join("\n") +
      `\n\nRefusing to start: without these, every route would return 500.\n` +
      `Fix with one of:\n` +
      `  npx clerk@latest env pull        # writes both keys into .env\n` +
      `  copy them from https://dashboard.clerk.com/last-active?path=api-keys\n` +
      `  (CLERK_SECRET_KEY is server-only and is never exposed to the browser)`,
  );
}
