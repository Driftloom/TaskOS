import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Only the DB-backed suite lives here; pure helpers are tested in
    // artifacts/api-server. The suite self-skips without DATABASE_URL.
    include: ["tests/**/*.test.ts"],
    // Invariant assertions touch a live database; running them in parallel
    // would interleave connections and make failures harder to read.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
