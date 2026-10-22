import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { LandingPage } from './LandingPage';
import { APP_VERSION_INFO } from '@/lib/version-info';
/**
 * The public landing page is the loudest surface the product has, and it
 * makes zero API calls. It may illustrate, but it may never assert a system
 * behaviour that does not happen: a fake streak, a log write the demo never
 * performs, a cap the engine does not use, a "live" badge, a save that never
 * saves, or a stale version.
 *
 * WebGL note: the landing page is built from Three.js/WebGL canvases and
 * jsdom has no WebGL context. `three`'s WebGLRenderer is therefore replaced
 * with a stub that renders nothing; every other Three.js class is the real
 * one, and the React tree under test is the real landing page.
 */
vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();

  class StubWebGLRenderer {
    domElement = document.createElement('canvas');
    toneMapping = 0;
    toneMappingExposure = 1;
    setSize() {}
    setPixelRatio() {}
    render() {}
    dispose() {}
  }

  return { ...actual, WebGLRenderer: StubWebGLRenderer };
});

// The demo schedules deferred work (plane boost, simulated save). Fake timers
// keep those callbacks from firing after the environment is torn down.
beforeEach(() => {
  vi.useFakeTimers();
  // jsdom implements no canvas context at all. The raw-WebGL hero canvas
  // asks for one and bails out when it gets null; stubbing it keeps the
  // output clean. The spy is restored in afterEach, so it cannot leak into
  // another file.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    (() => null) as unknown as typeof HTMLCanvasElement.prototype.getContext,
  );
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function renderLandingPage() {
  return render(<LandingPage />);
}

describe('LandingPage truthfulness', () => {
  it('never fabricates a streak in the simulated Telegram reply', () => {
    const { container } = renderLandingPage();

    // The reply only appears once the visitor drives the demo, so the claim
    // has to be checked after the interaction, not just on first paint.
    fireEvent.click(screen.getByRole('button', { name: /done/i }));

    expect(container.textContent).not.toContain('Streak: 12 days strict');
    expect(container.textContent).not.toContain('Streak:');
  });

  it('does not claim the demo wrote to the action log', () => {
    const { container } = renderLandingPage();

    fireEvent.click(screen.getByRole('button', { name: 'Accept Move' }));

    expect(container.textContent).not.toContain('Action logged to agent_action_log');
    expect(container.textContent).toContain('one-tap undo');
  });

  it('shows the real auto-move cap instead of fake state', () => {
    const { container } = renderLandingPage();

    fireEvent.click(screen.getByRole('button', { name: 'Accept Move' }));

    expect(container.textContent).toContain('Auto-move cap: 5 max');
    expect(container.textContent).not.toContain('2 / 5 max');
  });

  it('does not announce fabricated live values to screen readers', () => {
    renderLandingPage();

    expect(screen.queryByLabelText(/Streak 90%/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Focus 75%/)).not.toBeInTheDocument();
    expect(
      screen.getByLabelText('Animated illustration of three activity rings'),
    ).toBeInTheDocument();
  });

  it('labels the capture sandbox as a preview, not a live demo', () => {
    const { container } = renderLandingPage();

    expect(container.textContent).not.toContain('LIVE DEMO');
    expect(screen.getByText('INTERACTIVE PREVIEW')).toBeInTheDocument();
  });

  it('never claims the preview saved and time-blocked anything', () => {
    const { container } = renderLandingPage();

    fireEvent.click(screen.getByRole('button', { name: 'Submit simulated task' }));

    expect(container.textContent).not.toContain('Parsed & time-blocked');
    expect(container.textContent).toContain('nothing was saved');
  });

  it('labels the philosophy alert samples as illustrations', () => {
    const { container } = renderLandingPage();

    expect(container.textContent).toContain('Illustrative examples of the alerts Cadence sends.');
  });

  it('describes the morning ritual the way the app actually runs it', () => {
    const { container } = renderLandingPage();

    // The app's Morning Ritual picks ONE #1 next-up focus task. It has no
    // "3 anchors" concept, so the page must not claim one.
    expect(container.textContent).not.toContain('3 high-leverage focus anchors');
    expect(container.textContent).toContain('the one high-leverage focus task');
  });

  it('does not put a live-service pulse on the pre-auth hero', () => {
    renderLandingPage();

    const badge = screen.getByTestId('landing-hero-badge');
    expect(badge.querySelector('.animate-pulse')).toBeNull();
  });

  it('shows the real version instead of a hardcoded one', () => {
    const { container } = renderLandingPage();

    expect(container.textContent).not.toContain('v0.1.6');
    expect(container.textContent).toContain(`v${APP_VERSION_INFO.version}`);
  });

  it('links to the project repository instead of the bare github.com root', () => {
    const { container } = renderLandingPage();

    expect(container.querySelector('a[href="https://github.com"]')).toBeNull();
    // The exact repository URL, not merely "some path under github.com".
    const repoLink = container.querySelector('a[href="https://github.com/Driftloom/TaskOS"]');
    expect(repoLink).not.toBeNull();
    expect(repoLink?.getAttribute('href')).toBe('https://github.com/Driftloom/TaskOS');
  });

  it('makes the activity rings canvas keyboard-operable', () => {
    renderLandingPage();

    const rings = screen.getByLabelText('Animated illustration of three activity rings');
    expect(rings).toHaveAttribute('role', 'button');
    expect(rings).toHaveAttribute('tabindex', '0');

    rings.focus();
    expect(() => fireEvent.keyDown(rings, { key: 'Enter' })).not.toThrow();
    expect(() => fireEvent.keyDown(rings, { key: ' ' })).not.toThrow();
  });

  it('makes the telegram plane canvas keyboard-operable', () => {
    renderLandingPage();

    const plane = screen.getByLabelText('3D Telegram Webhook Plane');
    expect(plane).toHaveAttribute('role', 'button');
    expect(plane).toHaveAttribute('tabindex', '0');

    plane.focus();
    expect(() => fireEvent.keyDown(plane, { key: 'Enter' })).not.toThrow();
  });

  it('makes the token lexer canvas keyboard-operable', () => {
    renderLandingPage();

    const lexer = screen.getByLabelText('3D Natural Language Token Prism');
    expect(lexer).toHaveAttribute('role', 'button');
    expect(lexer).toHaveAttribute('tabindex', '0');

    lexer.focus();
    expect(() => fireEvent.keyDown(lexer, { key: 'Enter' })).not.toThrow();
  });

  it('makes the chrono canvas keyboard-operable', () => {
    renderLandingPage();

    const chrono = screen.getByLabelText(
      'Direct interactive 3D Chrono-Sphere representation of personal time matrix',
    );
    expect(chrono).toHaveAttribute('role', 'img');
    expect(chrono).toHaveAttribute('tabindex', '0');

    chrono.focus();
    expect(() => fireEvent.keyDown(chrono, { key: 'ArrowRight' })).not.toThrow();
    expect(() => fireEvent.keyDown(chrono, { key: 'ArrowLeft' })).not.toThrow();
  });
});
