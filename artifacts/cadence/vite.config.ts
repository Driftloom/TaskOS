import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';

const rawPort = process.env.PORT;

if (!rawPort) {
  throw new Error(
    'PORT environment variable is required but was not provided.',
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH;

if (!basePath) {
  throw new Error(
    'BASE_PATH environment variable is required but was not provided.',
  );
}

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss({ optimize: false }),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== 'production' &&
    process.env.REPL_ID !== undefined
      ? [
          await import('@replit/vite-plugin-cartographer').then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, '..'),
            }),
          ),
          await import('@replit/vite-plugin-dev-banner').then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
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
    dedupe: ['react', 'react-dom', '@tanstack/react-query'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        /**
         * manualChunks as a FUNCTION, matching resolved module paths.
         *
         * The object form (`{ 'vendor-react': ['react', 'react-dom'] }`) silently
         * did almost nothing here. pnpm symlinks dependencies into
         * node_modules/.pnpm, so the specifier Rollup sees in the module graph is
         * the real path under .pnpm/... and does not match the bare package name
         * the object form resolves against. Measured: vendor-react came out at
         * 9 kB, while React, ReactDOM, Clerk, sonner and cmdk all landed in the
         * 548 kB entry chunk anyway. The split looked configured and was not.
         *
         * Matching on `/node_modules/<pkg>/` catches the package wherever pnpm
         * has placed it. react-dom is ~130 kB raw on its own, so this is the
         * difference between a 548 kB entry and a ~200 kB one.
         *
         * Clerk is deliberately NOT split: it is the largest single dependency
         * and every route needs it, so a separate chunk would add a request for
         * no caching benefit. Sonner and cmdk are app-facing UI that the shell
         * uses immediately, so they stay with the entry.
         */
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;
          const p = id.replace(/\\/g, '/');
          if (/\/node_modules\/(react|react-dom|scheduler|wouter)\//.test(p)) {
            return 'vendor-react';
          }
          if (/\/node_modules\/@tanstack\/react-query\//.test(p)) {
            return 'vendor-query';
          }
          if (/\/node_modules\/lucide-react\//.test(p)) {
            return 'vendor-icons';
          }
          if (/\/node_modules\/sonner\//.test(p)) {
            return 'vendor-toast';
          }
          return undefined;
        },
      },
    },
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    fs: {
      strict: true,
    },
    // Windows/localhost dev only: forward same-origin /api calls to a
    // locally running API server. Unset on Replit/prod (platform routing
    // handles /api there), so this never affects deployed environments.
    ...(process.env.LOCAL_API_PROXY
      ? { proxy: { '/api': process.env.LOCAL_API_PROXY } }
      : {}),
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
