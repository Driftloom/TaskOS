import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E configuration for Cadence Task OS.
 *
 * WHY THIS FILE WAS REWRITTEN
 * ---------------------------
 * The previous version of this config, together with the four specs beside it,
 * could not have failed. Every spec guarded its real assertions behind
 *
 *     if (!page.url().includes('/today')) return;
 *     if (await button.isVisible()) { ... }
 *
 * so a blank page, an auth redirect, or an empty task list produced a green
 * run. That is worse than no test: it manufactures confidence. This config is
 * paired with specs that have no such escape hatch -- see
 * tests/e2e/README.md for the full rationale.
 *
 * Two environment facts drive the shape of this file:
 *
 *  1. Vite THROWS at config-load time without PORT and BASE_PATH
 *     (vite.config.ts:10-14 and :24-28). The webServer block therefore passes
 *     them through `env` rather than a `PORT=5173 && vite` shell prefix, which
 *     works on sh and silently breaks on Windows.
 *  2. `App.tsx:147-152` only bypasses Clerk when `import.meta.env.DEV` is true
 *     AND either the URL carries `?test_auth=true` or
 *     `localStorage.cadence_test_auth === 'true'`. tests/e2e/fixtures.ts seeds
 *     that localStorage key before any page script runs, so every navigation
 *     resolves to the real route instead of bouncing off `/`.
 *
 * NOT IN THE DEFAULT VERIFY GATE. See scripts/run-gates.cjs and the "Gates"
 * section of tests/e2e/README.md: this suite needs a ~310 MB browser download
 * and a dev server, so `pnpm run verify` must stay runnable without either.
 * `pnpm run verify:e2e` is the documented separate gate.
 */

const PORT = Number(process.env.E2E_PORT ?? 5173);
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

/** Absolute path so screenshots land under artifacts/cadence/test-results/,
 *  which .gitignore already excludes (`test-results/`). */
const OUTPUT_DIR = 'test-results';

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: OUTPUT_DIR,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // The old config set retries:2 on CI. Retries are how a flaky gate learns to
  // be green, so the honest-failure property is only meaningful at 0. A test
  // that needs a retry is a test that needs fixing.
  retries: 0,
  // Low on purpose. Every test drives a real browser against an UNBUNDLED Vite
  // dev server, so each worker competes for the same transform pipeline. Measured
  // with 4 workers on a 16-core box: a route-walk test that takes 16s alone took
  // 1m36s in parallel, and four tests died on timeouts that had nothing to do with
  // the app. With 2 workers the same suite is stable.
  workers: 2,
  // Generous, and deliberately so. The very first navigation after a lockfile
  // change makes Vite re-optimise its dependency graph, and on Windows that
  // cold start plus the full module-graph transform is tens of seconds. Measured
  // warm, a navigation is ~100ms, so this ceiling only absorbs cold start -- it
  // does not mask a hang, because `gotoRoute` waits on a real element after
  // commit and that wait is still bounded by `expect.timeout`.
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [
    ['list'],
    ['json', { outputFile: `${OUTPUT_DIR}/results.json` }],
  ],
  use: {
    baseURL: BASE_URL,
    trace: 'off',
    screenshot: 'only-on-failure',
    video: 'off',
    actionTimeout: 15_000,
    navigationTimeout: 120_000,
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    // NO MOBILE PROJECT, deliberately.
    //
    // An earlier revision added `mobile-chromium` at 390x844. It was removed
    // after measuring it, because most of its failures were artefacts of the
    // viewport rather than defects:
    //
    //   - `AppShell`'s sidebar is `hidden lg:flex`, so every sidebar selector is
    //     legitimately absent at 390px and reported as "element(s) not found".
    //   - `measureTapTarget` correctly returned "zero size / display:none" for
    //     those controls, which then counted as failures.
    //   - full-page screenshots at deviceScaleFactor 3 exceeded the 15s
    //     screenshot timeout.
    //
    // Shipping a project that fails for the wrong reason is the same sin as one
    // that passes for the wrong reason. Mobile is therefore an EXPLICIT GAP, not
    // a hidden one -- see tests/e2e/README.md, "What this suite does NOT verify".
    //
    // What mobile measurement did establish before removal: the task-row pencil
    // and delete buttons measure 32px at 390px (vs 28px at 1440px), and the
    // profile button 32px. The quick-capture field is `h-11 sm:h-8`, so it is a
    // compliant 44px on mobile and its 32px failure is desktop-only.
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: 'pnpm run dev',
        // Vite serves index.html for unknown paths, so a 200 alone does not prove
        // the app compiled. Playwright additionally requires a 2xx/3xx, which is
        // the strongest signal available without parsing the bundle.
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        stdout: 'pipe',
        stderr: 'pipe',
        env: {
          PORT: String(PORT),
          BASE_PATH: '/',
          VITE_CLERK_PUBLISHABLE_KEY:
            process.env.VITE_CLERK_PUBLISHABLE_KEY ||
            'pk_test_ZXhhbXBsZS5jbGVyay5hY2NvdW50cy5kZXYk',
          // Nothing here should reach a real backend; fixtures intercept /api/*.
          LOCAL_API_PROXY: '',
        },
      },
});