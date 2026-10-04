import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

/**
 * PwaUpdateNotifier
 *
 * Monitors Service Worker lifecycle in production.
 * When a new version is deployed and downloaded:
 * 1. Prompts the user with a Sonner toast: "New version available" + "Update now".
 * 2. When clicked, posts SKIP_WAITING to the waiting worker.
 * 3. On controllerchange, seamlessly reloads to activate the new version.
 * 4. Automatically checks for updates whenever the mobile PWA/APK resumes focus.
 */
export function PwaUpdateNotifier() {
  const promptedRef = useRef(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !import.meta.env.PROD) {
      return;
    }

    let refreshing = false;

    // Reload once when the new service worker takes control
    const onControllerChange = () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    };

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    const promptUser = (worker: ServiceWorker) => {
      if (promptedRef.current) return;
      promptedRef.current = true;

      toast('New version available', {
        description: 'An update to Cadence is ready to install.',
        duration: 30000,
        action: {
          label: 'Update now',
          onClick: () => {
            worker.postMessage({ type: 'SKIP_WAITING' });
          },
        },
      });
    };

    navigator.serviceWorker.getRegistration().then((registration) => {
      if (!registration) return;

      // Case 1: An updated worker is already waiting in background
      if (registration.waiting && navigator.serviceWorker.controller) {
        promptUser(registration.waiting);
      }

      // Case 2: An update is currently being fetched/installed
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            promptUser(newWorker);
          }
        });
      });

      // Periodically check for updates (every 30 minutes)
      const intervalId = window.setInterval(() => {
        registration.update().catch(() => {});
      }, 30 * 60 * 1000);

      // On mobile resume / visibility change, check for updates immediately
      const onVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
          registration.update().catch(() => {});
        }
      };

      document.addEventListener('visibilitychange', onVisibilityChange);

      return () => {
        window.clearInterval(intervalId);
        document.removeEventListener('visibilitychange', onVisibilityChange);
      };
    });

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);

  return null;
}
