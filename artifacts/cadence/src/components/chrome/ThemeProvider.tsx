import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

export type Theme = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'cadence.theme';

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: 'light' | 'dark';
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'system';
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch {
    // localStorage can throw in private mode / sandboxed iframes
  }
  return 'system';
}

function resolveTheme(preference: Theme): 'light' | 'dark' {
  if (preference !== 'system') return preference;
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readInitialTheme);
  // Re-render tick forced by the prefers-color-scheme subscription so an
  // OS preference change while on 'system' re-resolves and re-applies the DOM.
  const [osPreferenceTick, setOsPreferenceTick] = useState(0);

  const resolvedTheme = useMemo(() => resolveTheme(theme), [theme, osPreferenceTick]);

  useEffect(() => {
    const root = document.documentElement;
    // tokens.css scopes light to [data-theme="light"]; dark is the :root default.
    root.dataset.theme = resolvedTheme;
    root.classList.toggle('dark', resolvedTheme === 'dark');
    root.style.colorScheme = resolvedTheme;
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // non-fatal
    }
  }, [theme, resolvedTheme]);

  // Re-resolve when the OS preference changes while the user follows the system.
  useEffect(() => {
    if (theme !== 'system') return undefined;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => setOsPreferenceTick((t) => t + 1);
    media.addEventListener('change', handler);
    return () => media.removeEventListener('change', handler);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => setThemeState(t), []);
  const toggleTheme = useCallback(
    () =>
      setThemeState((prev) => (prev === 'light' ? 'dark' : prev === 'dark' ? 'system' : 'light')),
    [],
  );

  const value = useMemo(
    () => ({ theme, resolvedTheme, setTheme, toggleTheme }),
    [theme, resolvedTheme, setTheme, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used inside <ThemeProvider>');
  }
  return ctx;
}
