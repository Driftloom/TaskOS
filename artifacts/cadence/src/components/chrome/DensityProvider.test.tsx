import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DensityProvider,
  useDensity,
  isCompactAllowed,
  enforceDensityAllowed,
  DENSITY_STORAGE_KEY,
  type DensityMode,
} from './DensityProvider';

/**
 * jsdom has no layout and no real media query evaluation, so `(pointer: fine)`
 * cannot be inferred from the environment. Every pointer-sensitive test stubs
 * it explicitly instead of relying on whatever jsdom happens to answer, because
 * the compact gate is precisely a pointer-sensitive behaviour and a test that
 * passes for the wrong reason here is worse than no test.
 */
function stubPointer(initialFine: boolean) {
  const state = { fine: initialFine };
  const listeners = new Set<() => void>();
  // `matches` is a getter over shared state, not a snapshot. The provider
  // captures the MediaQueryList at mount, so a stub that returned a frozen
  // value would leave that captured reference reporting the pre-change answer
  // and the pointer-change tests would pass for the wrong reason.
  const mql = {
    media: '(pointer: fine)',
    get matches() {
      return state.fine;
    },
    addEventListener: (_type: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_type: string, fn: () => void) => listeners.delete(fn),
    addListener: (fn: () => void) => listeners.add(fn),
    removeListener: (fn: () => void) => listeners.delete(fn),
    dispatchEvent: () => true,
    onchange: null,
  };
  const matchMedia = vi.fn((query: string) => {
    if (query === '(pointer: fine)') return mql as unknown as MediaQueryList;
    // `(pointer: coarse)` is the inverse for our purposes.
    return { get matches() { return !state.fine; }, media: query } as unknown as MediaQueryList;
  });
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: matchMedia,
  });
  return {
    setFine(next: boolean) {
      state.fine = next;
      listeners.forEach((fn) => fn());
    },
  };
}

function Consumer() {
  const { density, setDensity } = useDensity();
  return (
    <div>
      <span data-testid="current-density">{density}</span>
      <button data-testid="btn-comfortable" onClick={() => setDensity('comfortable')}>
        Comfortable
      </button>
      <button data-testid="btn-default" onClick={() => setDensity('default')}>
        Default
      </button>
      <button data-testid="btn-compact" onClick={() => setDensity('compact')}>
        Compact
      </button>
    </div>
  );
}

describe('DensityProvider (§8.4)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-density');
    // Default to a fine pointer so the pre-gate expectations still hold; the
    // coarse-pointer cases opt out explicitly.
    stubPointer(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders children with default density when localStorage is empty', () => {
    render(
      <DensityProvider>
        <Consumer />
      </DensityProvider>,
    );
    expect(screen.getByTestId('current-density').textContent).toBe('default');
  });

  it('reads a stored density on mount', () => {
    window.localStorage.setItem(DENSITY_STORAGE_KEY, 'comfortable');
    render(
      <DensityProvider>
        <Consumer />
      </DensityProvider>,
    );
    expect(screen.getByTestId('current-density').textContent).toBe('comfortable');
  });

  it('updates documentElement attribute and localStorage when density changes', () => {
    render(
      <DensityProvider>
        <Consumer />
      </DensityProvider>,
    );

    expect(screen.getByTestId('current-density').textContent).toBe('default');

    fireEvent.click(screen.getByTestId('btn-compact'));

    expect(screen.getByTestId('current-density').textContent).toBe('compact');
    expect(document.documentElement.getAttribute('data-density')).toBe('compact');
    expect(window.localStorage.getItem(DENSITY_STORAGE_KEY)).toBe('compact');

    fireEvent.click(screen.getByTestId('btn-comfortable'));

    expect(screen.getByTestId('current-density').textContent).toBe('comfortable');
    expect(document.documentElement.getAttribute('data-density')).toBe('comfortable');
    expect(window.localStorage.getItem(DENSITY_STORAGE_KEY)).toBe('comfortable');
  });

  it('useDensity returns safe fallback when rendered outside DensityProvider', () => {
    function StandaloneConsumer() {
      const { density } = useDensity();
      return <span data-testid="fallback-density">{density}</span>;
    }

    render(<StandaloneConsumer />);
    expect(screen.getByTestId('fallback-density').textContent).toBe('default');
  });
});

/**
 * The compact gate. §8.4 restricts compact to `(pointer: fine)` and §P8.1 says
 * "Compact density may go to 32px only when `(pointer: fine)`" — a touch-safety
 * rule, not a preference. Compact sets a 38px row pitch while TaskRow's
 * complete-task control keeps a 44px hit box, so allowing compact on a coarse
 * pointer produces overlapping touch targets on the primary complete control.
 */
describe('compact is gated to fine pointers', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-density');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('isCompactAllowed reports the pointer media query', () => {
    stubPointer(true);
    expect(isCompactAllowed()).toBe(true);

    stubPointer(false);
    expect(isCompactAllowed()).toBe(false);
  });

  it('enforceDensityAllowed downgrades compact and leaves other modes alone', () => {
    stubPointer(false);
    expect(enforceDensityAllowed('compact')).toBe('default');
    expect(enforceDensityAllowed('comfortable')).toBe('comfortable');
    expect(enforceDensityAllowed('default')).toBe('default');

    stubPointer(true);
    expect(enforceDensityAllowed('compact')).toBe('compact');
  });

  it('refuses a compact selection on a coarse pointer', () => {
    stubPointer(false);
    render(
      <DensityProvider>
        <Consumer />
      </DensityProvider>,
    );

    fireEvent.click(screen.getByTestId('btn-compact'));

    // The click is refused, so neither the rendered state nor the DOM attribute
    // nor storage may move to compact.
    expect(screen.getByTestId('current-density').textContent).not.toBe('compact');
    expect(document.documentElement.getAttribute('data-density')).not.toBe('compact');
    expect(window.localStorage.getItem(DENSITY_STORAGE_KEY)).not.toBe('compact');
  });

  it('does not honour a compact value stored by a previous fine-pointer session', () => {
    stubPointer(false);
    window.localStorage.setItem(DENSITY_STORAGE_KEY, 'compact');

    render(
      <DensityProvider>
        <Consumer />
      </DensityProvider>,
    );

    expect(screen.getByTestId('current-density').textContent).toBe('default');
  });

  it('does honour a stored compact value on a fine pointer', () => {
    stubPointer(true);
    window.localStorage.setItem(DENSITY_STORAGE_KEY, 'compact');

    render(
      <DensityProvider>
        <Consumer />
      </DensityProvider>,
    );

    expect(screen.getByTestId('current-density').textContent).toBe('compact');
  });

  it('drops to default when the pointer changes to coarse while compact is active', () => {
    const pointer = stubPointer(true);
    window.localStorage.setItem(DENSITY_STORAGE_KEY, 'compact');

    render(
      <DensityProvider>
        <Consumer />
      </DensityProvider>,
    );
    expect(screen.getByTestId('current-density').textContent).toBe('compact');

    // A tablet gaining touch, or a laptop folding: the pointer changes without
    // a reload. The gate has to react to that, or the overlap case returns.
    // Dispatching the media-query change outside act() would batch the React
    // state update without flushing it, so the assertion would read the
    // pre-change value and pass or fail for the wrong reason.
    act(() => pointer.setFine(false));

    expect(screen.getByTestId('current-density').textContent).toBe('default');
  });

  it('allows compact again once the pointer returns to fine', () => {
    const pointer = stubPointer(true);
    render(
      <DensityProvider>
        <Consumer />
      </DensityProvider>,
    );

    fireEvent.click(screen.getByTestId('btn-compact'));
    expect(screen.getByTestId('current-density').textContent).toBe('compact');

    // Dispatching the media-query change outside act() would batch the React
    // state update without flushing it, so the assertion would read the
    // pre-change value and pass or fail for the wrong reason.
    act(() => pointer.setFine(false));
    expect(screen.getByTestId('current-density').textContent).toBe('default');

    act(() => pointer.setFine(true));
    fireEvent.click(screen.getByTestId('btn-compact'));
    expect(screen.getByTestId('current-density').textContent).toBe('compact');
  });

  it('falls back safely when matchMedia is unavailable', () => {
    // Sandboxed iframes and some SSR/hydration paths have no matchMedia. Compact
    // must not be reachable there, because there is no way to prove a fine
    // pointer.
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: undefined,
    });

    expect(isCompactAllowed()).toBe(false);
    expect(enforceDensityAllowed('compact' satisfies DensityMode)).toBe('default');
  });
});