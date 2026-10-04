/**
 * Native Notification Service and React Hook for Cadence.
 *
 * Provides enterprise-grade notification handling:
 * 1. Checks device & browser capabilities (supports mobile PWA, desktop, iOS Web Push).
 * 2. Emits reactive events on permission state change.
 * 3. Delivers local notifications via Service Worker (lock screen & wake) with fallback.
 */

import { useEffect, useState, useCallback } from 'react';
import { soundFX } from '@/lib/sound-fx';

export type NotificationPermissionState = 'default' | 'granted' | 'denied' | 'unsupported';

export const NOTIFICATION_EVENT = 'cadence:notification-permission-changed';

/** Check if Notification API is available in current environment. */
export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/** Get current permission state without prompting. */
export function getNotificationPermission(): NotificationPermissionState {
  if (!isNotificationSupported()) {
    return 'unsupported';
  }
  return Notification.permission as NotificationPermissionState;
}

/**
 * Enterprise soft-ask execution: triggers the native browser dialog and broadcasts change.
 */
export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (!isNotificationSupported()) {
    return 'unsupported';
  }

  try {
    const result = await Notification.requestPermission();
    if (result === 'granted') {
      soundFX.playCompletion();
      // Dispatch an initial test/welcome toast to confirm native hookup
      await sendLocalNotification('Cadence Notifications Active', {
        body: 'You will receive focus timer bells and scheduled task alerts.',
        icon: '/icon-192.png',
        tag: 'cadence-welcome-notification',
      });
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent(NOTIFICATION_EVENT, { detail: { permission: result } }),
      );
    }

    return result as NotificationPermissionState;
  } catch (error) {
    console.error('Error requesting notification permission:', error);
    return getNotificationPermission();
  }
}

/**
 * Display a local notification via Service Worker registration (preferred on mobile/PWA)
 * with a fallback to direct window Notification.
 */
export async function sendLocalNotification(
  title: string,
  options: NotificationOptions = {},
): Promise<boolean> {
  if (getNotificationPermission() !== 'granted') {
    return false;
  }

  const defaultOptions: NotificationOptions = {
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    ...options,
  };

  try {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.ready;
      if (registration && 'showNotification' in registration) {
        await registration.showNotification(title, defaultOptions);
        return true;
      }
    }

    if (typeof Notification !== 'undefined') {
      new Notification(title, defaultOptions);
      return true;
    }
  } catch (err) {
    console.warn('Failed to dispatch notification:', err);
  }

  return false;
}

/**
 * React hook to observe and interact with notification permission status.
 */
export function useNotificationPermission() {
  const [permission, setPermission] = useState<NotificationPermissionState>(getNotificationPermission);

  const refreshPermission = useCallback(() => {
    setPermission(getNotificationPermission());
  }, []);

  useEffect(() => {
    refreshPermission();

    const handleCustomEvent = () => refreshPermission();
    const handleFocus = () => refreshPermission();

    window.addEventListener(NOTIFICATION_EVENT, handleCustomEvent);
    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener(NOTIFICATION_EVENT, handleCustomEvent);
      window.removeEventListener('focus', handleFocus);
    };
  }, [refreshPermission]);

  const request = useCallback(async () => {
    soundFX.playTactileClick();
    const result = await requestNotificationPermission();
    setPermission(result);
    return result;
  }, []);

  const sendTest = useCallback(async () => {
    soundFX.playTactileClick();
    return sendLocalNotification('Test Alert from Cadence', {
      body: 'Lock-screen and audio alerts are functioning correctly.',
      icon: '/icon-192.png',
    });
  }, []);

  return {
    permission,
    isSupported: permission !== 'unsupported',
    isGranted: permission === 'granted',
    isDenied: permission === 'denied',
    isDefault: permission === 'default',
    requestPermission: request,
    sendTestNotification: sendTest,
    refreshPermission,
  };
}
