/**
 * Fail-fast validation for the Clerk publishable key.
 *
 * `clerkMiddleware` throws per-request when the key is malformed, so a bad key
 * turned every route into a 500 at request time with no signal at boot. This
 * turns that into one clear message at startup.
 *
 * Format only. It deliberately does not verify the key against Clerk, which
 * would require a network call at boot.
 */
export function assertClerkKeyUsable(key: string | undefined): void {
  if (!key) {
    throw new Error(
      "CLERK_PUBLISHABLE_KEY is not set. The server cannot authenticate requests.\n" +
        "  Local: add CLERK_PUBLISHABLE_KEY=pk_test_... to .env\n" +
        "  To fetch it: npx clerk@latest env pull",
    );
  }
  if (!/^pk_(test|live)_[A-Za-z0-9_-]{20,}$/.test(key)) {
    throw new Error(
      "CLERK_PUBLISHABLE_KEY is malformed (expected pk_test_... or pk_live_...).\n" +
        "  Refusing to start rather than returning 500 on every request.\n" +
        "  To fetch a valid key: npx clerk@latest env pull",
    );
  }
}
