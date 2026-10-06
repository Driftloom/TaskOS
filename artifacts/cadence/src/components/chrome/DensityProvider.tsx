import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

/**
 * Density modes per docs/13-master-design-system-prompt.md §8.4 (P1).
 *
 * Comfortable: 56px rows, 48px controls, 16px padding (touch/mobile default)
 * Default:     48px rows, 44px controls, 12-16px padding (tablet/general)
 * Compact:     36px rows, 32px controls, 8-12px padding (pointer: fine only)
 *
 * Density changes spacing and row/control heights via tokens only.
 * It never reduces text below 12px, never drops touch targets under 44 on touch,
 * and never changes information hierarchy.
 */
export type DensityMode = 'comfortable' | 'default' | 'compact';

export const DENSITY_STORAGE_KEY = 'cadence.density';

interface DensityContextValue {
  density: DensityMode;
  setDensity: (mode: DensityMode) => void;
}

const DensityContext = createContext<DensityContextValue | null>(null);

/**
 * Spec §8.4 restricts compact to `(pointer: fine)` and §P8.1 repeats it:
 * "Compact density may go to 32px only when `(pointer: fine)`". This is a
 * touch-safety constraint, not a density preference, so it is enforced in two
 * places on purpose: here so an invalid stored value cannot be honoured, and in
 * index.css so the compact variable block cannot apply even if the attribute
 * is set by something other than this provider.
 *
 * Without the gate this is a live defect, not a theoretical one. Compact sets
 * the row pitch to 38px while TaskRow's complete-task control keeps its 44px
 * hit box (size-11 with -m-2.5), so on a phone the box overhangs the row by 3px
 * top and bottom while adjacent rows sit 38px apart. index.css's
 * .tap-target-expand already warns that centres under 44px apart produce
 * overlapping hit areas; compact is exactly that case.
 *
 * A pointer can also change (a tablet gaining a mouse, a laptop folding to
 * touch), so this is re-evaluated on change rather than only at mount.
 */
export function isCompactAllowed(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  try {
    // No explicit `any-pointer` check: a hybrid device reports both, and
    // allowing compact there is what the spec asks for.
    return window.matchMedia('(pointer: fine)').matches;
  } catch {
    return false;
  }
}

/** Drops compact when the current pointer cannot support it. */
export function enforceDensityAllowed(mode: DensityMode): DensityMode {
  return mode === 'compact' && !isCompactAllowed() ? 'default' : mode;
}

export function detectDefaultDensity(): DensityMode {
  if (typeof window === 'undefined') return 'default';
  try {
    const isTouch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    if (isTouch) return 'comfortable';
  } catch {
    // non-fatal
  }
  return 'default';
}

export function readInitialDensity(): DensityMode {
  if (typeof window === 'undefined') return 'default';
  try {
    const stored = window.localStorage.getItem(DENSITY_STORAGE_KEY);
    if (stored === 'comfortable' || stored === 'default' || stored === 'compact') {
      // A stored compact from a previous session is honoured only if this
      // pointer still supports it; otherwise it silently falls back.
      return enforceDensityAllowed(stored);
    }
  } catch {
    // localStorage can throw in private browsing / sandboxed iframes
  }
  return detectDefaultDensity();
}

export function DensityProvider({ children }: { children: ReactNode }) {
  const [density, setDensityState] = useState<DensityMode>(readInitialDensity);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-density', density);
    try {
      window.localStorage.setItem(DENSITY_STORAGE_KEY, density);
    } catch {
      // non-fatal
    }
  }, [density]);

  // Re-check when the pointer type changes. Without this, a user who picked
  // compact on a desktop and then folds to touch keeps compact, which is the
  // overlap case the gate exists to prevent.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    let mq: MediaQueryList;
    try {
      mq = window.matchMedia('(pointer: fine)');
    } catch {
      return;
    }
    const onChange = () => {
      setDensityState((current) => enforceDensityAllowed(current));
    };
    // addEventListener is the modern form; Safari < 14 only has addListener.
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    }
    mq.addListener(onChange);
    return () => mq.removeListener(onChange);
  }, []);

  const setDensity = useCallback((d: DensityMode) => {
    // Refuse the transition rather than accept it and immediately undo it, so
    // the caller's optimistic state and the DOM cannot disagree.
    setDensityState((current) => (d === 'compact' && !isCompactAllowed() ? current : d));
  }, []);

  const value = useMemo(() => ({ density, setDensity }), [density, setDensity]);

  return <DensityContext.Provider value={value}>{children}</DensityContext.Provider>;
}

export function useDensity(): DensityContextValue {
  const ctx = useContext(DensityContext);
  if (!ctx) {
    return {
      density: 'default',
      setDensity: () => {},
    };
  }
  return ctx;
}
