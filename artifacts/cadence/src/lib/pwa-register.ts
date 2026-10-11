/**
 * Service worker registration.
 *
 * Production only, and deliberately not in index.html. An inline <script> there
 * cannot read `import.meta.env.PROD`, so it had no way to tell a dev server from
 * a deploy and registered unconditionally. main.tsx then unregistered every
 * registration in DEV. Those two fought on every reload: the freshly registered
 * worker reached `activate` after the same page load had torn its registration
 * down, `self.clients.claim()` rejected with
 * `InvalidStateError: Only the active worker can claim clients`, and because the
 * rejection was held by `event.waitUntil` it surfaced as
 * "Uncaught (in promise) InvalidStateError" in the console.
 *
 * From a module, `import.meta.env.PROD` is statically false under
 * `vite dev`, so the whole call is dead code that Rollup drops. No worker is
 * created, so there is nothing to race and nothing to unregister.
 *
 * Registration moved out of the HTML body and in here, which keeps it after
 * document parse -- `scripts/verify-web-vitals-budget.cjs` (lines 500, 580)
 * states that sw.js is excluded from first-visit transfer because it is
 * registered after load, and that stays true.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (!('serviceWorker' in navigator)) return;

  const secureContext =
    window.isSecureContext ||
    location.protocol === 'https:' ||
    location.hostname === 'localhost' ||
    location.hostname === '127.0.0.1';

  if (!secureContext) return;

  navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((err) => {
    console.warn('Service worker registration failed:', err);
  });
}