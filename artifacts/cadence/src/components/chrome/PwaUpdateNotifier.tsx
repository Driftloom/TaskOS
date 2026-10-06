import { useEffect, useRef, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { UpdatePromptDialog } from './UpdatePromptDialog';
import { APP_VERSION_INFO, isUpdateDismissedThisSession, markUpdateDismissed } from '@/lib/version-info';

/**
 * PwaUpdateNotifier
 *
 * Enterprise-grade Service Worker lifecycle controller.
 * 1. Monitors for background service worker updates.
 * 2. Displays immediate actionable toast notification with "Update now" and "✕" (dismiss).
 * 3. If dismissed or ignored, on app foreground resume or reload, renders UpdatePromptDialog with "What's New" release notes.
 * 4. Coordinates clean skipWaiting and controllerchange reload.
 */
export function PwaUpdateNotifier() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [showModal, setShowModal] = useState<boolean>(false);
  const promptedToastRef = useRef<boolean>(false);

  const applyUpdate = useCallback(() => {
    if (waitingWorker) {
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    }
  }, [waitingWorker]);

  const handleDismiss = useCallback(() => {
    markUpdateDismissed(APP_VERSION_INFO.version);
    setShowModal(false);
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !import.meta.env.PROD) {
      return;
    }

    let refreshing = false;
    const hadControllerOnMount = Boolean(navigator.serviceWorker.controller);

    // Reload once when the new service worker takes control (only on updates, never first install)
    const onControllerChange = () => {
      if (!hadControllerOnMount) return;
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    };

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    const handleWaitingWorker = (worker: ServiceWorker) => {
      setWaitingWorker(worker);

      const alreadyDismissed = isUpdateDismissedThisSession(APP_VERSION_INFO.version);

      if (alreadyDismissed) {
        // If dismissed earlier in the session, prompt via modal on app launch/resume
        setShowModal(true);
        return;
      }

      if (!promptedToastRef.current) {
        promptedToastRef.current = true;
        toast('New version available (v' + APP_VERSION_INFO.version + ')', {
          description: 'An update to Cadence is ready to install.',
          duration: 20000,
          action: {
            label: 'Update now',
            onClick: () => {
              worker.postMessage({ type: 'SKIP_WAITING' });
            },
          },
          cancel: {
            label: 'Later',
            onClick: () => {
              markUpdateDismissed(APP_VERSION_INFO.version);
            },
          },
        });
      }
    };

    navigator.serviceWorker.getRegistration().then((registration) => {
      if (!registration) return;

      // Case 1: An updated worker is already waiting in background
      if (registration.waiting && navigator.serviceWorker.controller) {
        handleWaitingWorker(registration.waiting);
      }

      // Case 2: An update is currently being fetched/installed
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            handleWaitingWorker(newWorker);
          }
        });
      });

      // Periodically check for updates (every 20 minutes)
      const intervalId = window.setInterval(() => {
        registration.update().catch(() => {});
      }, 20 * 60 * 1000);

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

  return (
    <UpdatePromptDialog
      isOpen={showModal && Boolean(waitingWorker)}
      onUpdate={applyUpdate}
      onDismiss={handleDismiss}
    />
  );
}
