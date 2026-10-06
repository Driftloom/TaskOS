import { useState, useEffect } from 'react';

/**
 * Checks whether the current window is running inside an installed standalone application
 * (Android TWA, iOS Home Screen PWA, or Desktop installed web app).
 */
export function checkIsStandalone(): boolean {
  if (typeof window === 'undefined') return false;

  // 1. Android / Desktop display-mode media query
  const isDisplayStandalone = window.matchMedia('(display-mode: standalone)').matches;

  // 2. iOS Safari standalone property
  const isNavigatorStandalone = Boolean((window.navigator as { standalone?: boolean }).standalone);

  // 3. Android TWA intent referrer
  const isAndroidAppReferrer =
    typeof document !== 'undefined' &&
    Boolean(document.referrer && document.referrer.startsWith('android-app://'));

  // 4. Query param indicator (if launched with custom start_url)
  const hasAppParam =
    window.location.search.includes('source=twa') ||
    window.location.search.includes('source=pwa') ||
    window.location.search.includes('mode=standalone');

  return isDisplayStandalone || isNavigatorStandalone || isAndroidAppReferrer || hasAppParam;
}

/**
 * Hook to reactively monitor if the app is running in standalone / installed mode.
 */
export function useIsStandalone(): boolean {
  const [isStandalone, setIsStandalone] = useState<boolean>(checkIsStandalone);

  useEffect(() => {
    setIsStandalone(checkIsStandalone());

    if (typeof window === 'undefined' || !window.matchMedia) return;

    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const handler = (e: MediaQueryListEvent) => {
      setIsStandalone(e.matches || checkIsStandalone());
    };

    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  return isStandalone;
}
