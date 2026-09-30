/// <reference types="@testing-library/jest-dom/vitest" />

/**
 * Ambient types for the web app's unit tests.
 *
 * `@testing-library/jest-dom/vitest` is imported for its side effect in
 * `vitest.setup.ts`, which registers the matchers at runtime. That runtime
 * import is invisible to the type checker, so without this reference every
 * `expect(...).toBeInTheDocument()` in a `*.test.tsx` file is a TS2339.
 *
 * This lives in a `.d.ts` rather than in `tsconfig.json#types` on purpose: the
 * package's ROOT type entry augments the Jest globals, and this suite does not
 * use Jest globals (`test.globals` is off). The `/vitest` subpath is the one
 * that augments vitest's own `Assertion` interface.
 */
export {};