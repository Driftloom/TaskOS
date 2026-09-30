import path from 'path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * Standalone vitest config for the web app.
 *
 * Deliberately NOT merged into `vite.config.ts`: that file throws when `PORT`
 * / `BASE_PATH` are unset (they are Replit-injected at dev time), so importing
 * it from a test run would fail before a single test executed. The alias and
 * dedupe lists below are therefore kept byte-identical to the ones in
 * `vite.config.ts` — if either changes there, it must change here too.
 *
 * Note there is no `@vitejs/plugin-tailwind` / `@tailwindcss/vite` here: the
 * components under test never import CSS, and running Tailwind over the test
 * suite would only slow it down.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
      'react': path.resolve(import.meta.dirname, 'node_modules/react'),
      'react-dom': path.resolve(import.meta.dirname, 'node_modules/react-dom'),
    },
    // Without this, `lib/api-client-react` and the app can end up with two Reacts
    // and "invalid hook call" fires on the first render.
    dedupe: ['react', 'react-dom', '@tanstack/react-query'],
  },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // Every file here renders real DOM into one shared jsdom per worker; the
    // suites are small and share no global state, but a deterministic order is
    // cheaper than debugging a cross-file leak.
    restoreMocks: true,
  },
});