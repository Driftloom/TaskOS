import { useEffect, useState, useCallback } from 'react';

export type ReducedMotionPreference = 'system' | 'reduce' | 'no-preference';

export const REDUCED_MOTION_STORAGE_KEY = 'cadence.reduced_motion';
export const REDUCED_MOTION_EVENT = 'cadence:reduced-motion-changed';

/**
 * Reads the stored reduced motion preference, defaulting to 'system'.
 */
export function getReducedMotionPreference(): ReducedMotionPreference {
  if (typeof window === 'undefined') return 'system';
  try {
    const stored = window.localStorage.getItem(REDUCED_MOTION_STORAGE_KEY);
    if (stored === 'reduce' || stored === 'no-preference' || stored === 'system') {
      return stored;
    }
  } catch {
    /* ignore storage errors */
  }
  return 'system';
}

/**
 * Checks if the system OS currently prefers reduced motion.
 */
export function getSystemPrefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * Resolves the effective reduced motion state given the preference and OS setting.
 */
export function resolveReducedMotion(preference: ReducedMotionPreference): boolean {
  if (preference === 'reduce') return true;
  if (preference === 'no-preference') return false;
  return getSystemPrefersReducedMotion();
}

/**
 * Synchronizes the data attribute on document.documentElement for CSS targeting.
 */
function syncDocumentAttribute(isReduced: boolean): void {
  if (typeof document !== 'undefined' && document.documentElement) {
    if (isReduced) {
      document.documentElement.setAttribute('data-reduced-motion', 'true');
    } else {
      document.documentElement.removeAttribute('data-reduced-motion');
    }
  }
}

/**
 * Stores a new reduced motion preference, updates the DOM, and notifies all subscribers.
 */
export function setReducedMotionPreference(pref: ReducedMotionPreference): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(REDUCED_MOTION_STORAGE_KEY, pref);
  } catch {
    /* ignore storage errors */
  }
  const isReduced = resolveReducedMotion(pref);
  syncDocumentAttribute(isReduced);
  window.dispatchEvent(new CustomEvent(REDUCED_MOTION_EVENT, { detail: { preference: pref, isReduced } }));
}

/**
 * React hook that returns true if reduced motion is effective (either forced by user or OS).
 */
export function useReducedMotion(): boolean {
  const [isReduced, setIsReduced] = useState<boolean>(() => {
    return resolveReducedMotion(getReducedMotionPreference());
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const update = () => {
      const pref = getReducedMotionPreference();
      const eff = resolveReducedMotion(pref);
      setIsReduced(eff);
      syncDocumentAttribute(eff);
    };

    update();

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleMediaChange = () => {
      const pref = getReducedMotionPreference();
      if (pref === 'system') {
        update();
      }
    };

    const handleCustomEvent = () => {
      update();
    };

    mediaQuery.addEventListener('change', handleMediaChange);
    window.addEventListener(REDUCED_MOTION_EVENT, handleCustomEvent);
    window.addEventListener('storage', handleCustomEvent);

    return () => {
      mediaQuery.removeEventListener('change', handleMediaChange);
      window.removeEventListener(REDUCED_MOTION_EVENT, handleCustomEvent);
      window.removeEventListener('storage', handleCustomEvent);
    };
  }, []);

  return isReduced;
}

/**
 * React hook providing the current preference mode and a setter.
 */
export function useReducedMotionControl(): {
  preference: ReducedMotionPreference;
  setPreference: (pref: ReducedMotionPreference) => void;
  isReduced: boolean;
} {
  const [preference, setPrefState] = useState<ReducedMotionPreference>(getReducedMotionPreference);
  const isReduced = useReducedMotion();

  useEffect(() => {
    const handleEvent = () => {
      setPrefState(getReducedMotionPreference());
    };
    window.addEventListener(REDUCED_MOTION_EVENT, handleEvent);
    window.addEventListener('storage', handleEvent);
    return () => {
      window.removeEventListener(REDUCED_MOTION_EVENT, handleEvent);
      window.removeEventListener('storage', handleEvent);
    };
  }, []);

  const setPreference = useCallback((pref: ReducedMotionPreference) => {
    setReducedMotionPreference(pref);
    setPrefState(pref);
  }, []);

  return {
    preference,
    setPreference,
    isReduced,
  };
}
