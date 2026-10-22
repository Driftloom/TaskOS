import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAnimationGate } from './useAnimationGate';

type RefObject = React.RefObject<Element | null>;

function makeRef(element: Element | null): RefObject {
  return { current: element } as RefObject;
}

describe('useAnimationGate', () => {
  let observeCallback: IntersectionObserverCallback | null = null;

  beforeEach(() => {
    observeCallback = null;
    // jsdom has no IntersectionObserver; stub it so we control isIntersecting.
    vi.stubGlobal(
      'IntersectionObserver',
      vi.fn((cb: IntersectionObserverCallback) => {
        observeCallback = cb;
        return {
          observe: vi.fn(),
          unobserve: vi.fn(),
          disconnect: vi.fn(),
        } as unknown as IntersectionObserver;
      }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('defaults active to true when the tab is visible and not yet observed', () => {
    const { result } = renderHook(() => useAnimationGate(makeRef(null)));
    expect(result.current.active).toBe(true);
  });

  it('becomes inactive when the tab is hidden', () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    const ref = makeRef(div);

    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(
      'hidden' as DocumentVisibilityState,
    );

    const { result } = renderHook(() => useAnimationGate(ref));

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(result.current.active).toBe(false);

    document.body.removeChild(div);
    vi.restoreAllMocks();
  });

  it('becomes inactive when the element is not intersecting', () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    const ref = makeRef(div);

    const { result } = renderHook(() => useAnimationGate(ref));
    expect(result.current.active).toBe(true);

    act(() => {
      observeCallback!([{ isIntersecting: false } as unknown as IntersectionObserverEntry]);
    });
    expect(result.current.active).toBe(false);

    act(() => {
      observeCallback!([{ isIntersecting: true } as unknown as IntersectionObserverEntry]);
    });
    expect(result.current.active).toBe(true);

    document.body.removeChild(div);
  });
});
