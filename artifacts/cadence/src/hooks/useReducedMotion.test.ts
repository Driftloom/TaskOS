import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useReducedMotion,
  useReducedMotionControl,
  setReducedMotionPreference,
  getReducedMotionPreference,
  REDUCED_MOTION_STORAGE_KEY,
} from './useReducedMotion';

describe('useReducedMotion', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-reduced-motion');
    // Mock matchMedia
    vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.documentElement.removeAttribute('data-reduced-motion');
  });

  it('defaults to system preference and is false when OS does not prefer reduced motion', () => {
    expect(getReducedMotionPreference()).toBe('system');
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
    expect(document.documentElement.getAttribute('data-reduced-motion')).toBeNull();
  });

  it('turns true when in-app preference is set to reduce', () => {
    const { result } = renderHook(() => useReducedMotionControl());
    expect(result.current.isReduced).toBe(false);

    act(() => {
      result.current.setPreference('reduce');
    });

    expect(result.current.preference).toBe('reduce');
    expect(result.current.isReduced).toBe(true);
    expect(localStorage.getItem(REDUCED_MOTION_STORAGE_KEY)).toBe('reduce');
    expect(document.documentElement.getAttribute('data-reduced-motion')).toBe('true');
  });

  it('turns false when in-app preference is set to no-preference', () => {
    const { result } = renderHook(() => useReducedMotionControl());

    act(() => {
      result.current.setPreference('no-preference');
    });

    expect(result.current.preference).toBe('no-preference');
    expect(result.current.isReduced).toBe(false);
    expect(document.documentElement.getAttribute('data-reduced-motion')).toBeNull();
  });

  it('reacts to OS prefers-reduced-motion when preference is system', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })));

    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(true);
  });
});
