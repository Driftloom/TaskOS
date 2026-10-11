import { createRoot } from 'react-dom/client';

import App from './App';
import { ErrorBoundary } from '@/components/error-boundary';
import { setupDevMock } from '@/lib/dev-mock';
import { registerServiceWorker } from '@/lib/pwa-register';

import './index.css';

if (import.meta.env.DEV) {
  setupDevMock();
}

// Production only; a no-op tree-shaken out of the dev build. See pwa-register.ts.
registerServiceWorker();

createRoot(document.getElementById('root')!, {
  // Keeps caught errors off reportError(), which would raise the dev overlay.
  onCaughtError: (error, errorInfo) => {
    console.error(error, errorInfo.componentStack);
  },
}).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);

// One-time cleanup for developers who ran the app before registration moved to
// pwa-register.ts, when index.html registered in dev too. Nothing registers in
// dev now, so this no longer races anything: there is no worker in flight to
// tear down mid-activate. Keeping it clears the worker and its caches a dev
// picked up from an earlier session, which is what caused stale chunk poisoning.
if ('serviceWorker' in navigator && import.meta.env.DEV) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      registration.unregister();
    }
  });
  if ('caches' in window) {
    caches.keys().then((keys) => {
      for (const key of keys) {
        caches.delete(key);
      }
    });
  }
}
