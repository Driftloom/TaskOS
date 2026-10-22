import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { type ReactNode, useEffect } from 'react';
import { ThemeProvider, useTheme, type Theme } from './ThemeProvider';

function Harness({ initialTheme }: { initialTheme?: Theme }) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  useEffect(() => {
    if (initialTheme != null) {
      setTheme(initialTheme);
    }
  }, [initialTheme, setTheme]);
  return (
    <div data-testid="harness">
      <span data-testid="resolved-theme">{resolvedTheme}</span>
      <span data-testid="stored-theme">{theme}</span>
    </div>
  );
}

const ROOT = document.documentElement;

function stubColorScheme(initialDark: boolean) {
  const state = { dark: initialDark };
  const listeners = new Set<() => void>();
  const mql = {
    media: '(prefers-color-scheme: dark)',
    get matches() {
      return state.dark;
    },
    addEventListener: (_type: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_type: string, fn: () => void) => listeners.delete(fn),
    dispatchEvent: () => true,
    onchange: null,
  } as unknown as MediaQueryList;
  const matchMedia = vi.fn(() => mql);
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: matchMedia,
  });
  return {
    setDark(next: boolean) {
      state.dark = next;
      listeners.forEach((fn) => fn());
    },
  };
}

describe('ThemeProvider (§dark-mode)', () => {
  let colorScheme: ReturnType<typeof stubColorScheme>;

  beforeEach(() => {
    window.localStorage.clear();
    ROOT.removeAttribute('data-theme');
    ROOT.classList.remove('dark');
    colorScheme = stubColorScheme(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('applies data-theme and the .dark class when system resolves to dark', () => {
    colorScheme.setDark(true);
    render(
      <ThemeProvider>
        <Harness initialTheme="system" />
      </ThemeProvider>,
    );
    expect(ROOT.dataset.theme).toBe('dark');
    expect(ROOT.classList.contains('dark')).toBe(true);
    expect(screen.getByTestId('resolved-theme').textContent).toBe('dark');
  });

  it('applies light theme without the .dark class', () => {
    render(
      <ThemeProvider>
        <Harness initialTheme="light" />
      </ThemeProvider>,
    );
    expect(ROOT.dataset.theme).toBe('light');
    expect(ROOT.classList.contains('dark')).toBe(false);
    expect(screen.getByTestId('resolved-theme').textContent).toBe('light');
  });

  it('falls back to system when nothing is stored', () => {
    colorScheme.setDark(true);
    render(
      <ThemeProvider>
        <Harness />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('stored-theme').textContent).toBe('system');
    expect(ROOT.dataset.theme).toBe('dark');
    expect(ROOT.classList.contains('dark')).toBe(true);
  });

  it('persists the system preference to localStorage', () => {
    render(
      <ThemeProvider>
        <Harness initialTheme="system" />
      </ThemeProvider>,
    );
    expect(window.localStorage.getItem('cadence.theme')).toBe('system');
  });

  it('re-resolves when the OS preference changes while on system', () => {
    colorScheme.setDark(false);
    render(
      <ThemeProvider>
        <Harness initialTheme="system" />
      </ThemeProvider>,
    );
    expect(ROOT.dataset.theme).toBe('light');
    expect(ROOT.classList.contains('dark')).toBe(false);

    act(() => {
      colorScheme.setDark(true);
    });
    expect(ROOT.dataset.theme).toBe('dark');
    expect(ROOT.classList.contains('dark')).toBe(true);
  });
});
