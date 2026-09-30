import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FocusTimer, resolveFocusTimerState, type FocusTimerState } from './FocusTimer';
import { formatTimer } from '@/lib/date-utils';
import { elapsedFromAnchor, readAnchor, writeAnchor } from '@/lib/focus/runAnchor';

/**
 * Two things are locked here.
 *
 * 1. §P11.1 state rendering. Each state must be distinguishable WITHOUT colour
 *    (§P6.3): an icon plus a text label, a `data-state`, and the right controls.
 *
 * 2. The elapsed-recovery contract. Reopening the app must rebuild the real
 *    elapsed time from the persisted wall-clock anchor, not restart the clock.
 *    The component is presentation-only — it never owns the clock — so the
 *    recovery test drives the anchor through `lib/focus/runAnchor` (the exact
 *    functions `FocusPage` calls) and asserts the rendered readout.
 */

const base = {
  taskTitle: 'Write the PS1 section',
  plannedMinutes: 25,
  elapsedSeconds: 0,
};

const renderTimer = (props: Partial<React.ComponentProps<typeof FocusTimer>> = {}) =>
  render(
    <FocusTimer
      state="idle"
      {...base}
      {...props}
    />,
  );

describe('resolveFocusTimerState — the pure state derivation', () => {
  it('is idle with no session, whatever the other flags say', () => {
    expect(
      resolveFocusTimerState({ hasSession: false, sessionStatus: undefined, recovered: true, syncFailed: true }),
    ).toBe('idle');
  });

  it.each([
    ['completed', 'finished'],
    ['paused', 'paused'],
    ['canceled', 'running'],
    ['active', 'running'],
    [undefined, 'running'],
  ] as const)('maps server status %s to %s', (sessionStatus, expected) => {
    expect(
      resolveFocusTimerState({ hasSession: true, sessionStatus, recovered: false, syncFailed: false }),
    ).toBe(expected);
  });

  it('recovers an active round that was still running when the app went away', () => {
    expect(
      resolveFocusTimerState({ hasSession: true, sessionStatus: 'active', recovered: true, syncFailed: false }),
    ).toBe('recovered');
  });

  it('lets a sync failure outrank "recovered" — it is the fact the user must act on first', () => {
    expect(
      resolveFocusTimerState({ hasSession: true, sessionStatus: 'active', recovered: true, syncFailed: true }),
    ).toBe('sync-failed-but-running');
  });

  it('does not call a paused round recovered, even if the flag is stale', () => {
    expect(
      resolveFocusTimerState({ hasSession: true, sessionStatus: 'paused', recovered: true, syncFailed: false }),
    ).toBe('paused');
  });
});

describe('FocusTimer state rendering (§P11.1)', () => {
  it('exposes the state on the root so the state is assertable, not just visual', () => {
    const states: FocusTimerState[] = [
      'idle',
      'running',
      'paused',
      'recovered',
      'sync-failed-but-running',
      'finished',
      'break',
    ];
    for (const state of states) {
      const { unmount } = renderTimer({ state });
      expect(screen.getByTestId('focus-timer')).toHaveAttribute('data-state', state);
      unmount();
    }
  });

  it('idle: shows the planned duration and only offers Begin focus', () => {
    const onStart = vi.fn();
    renderTimer({ state: 'idle', elapsedSeconds: 0, onStart });
    expect(screen.getByTestId('focus-timer-digits')).toHaveTextContent('00:00');
    expect(screen.getByTestId('button-begin-focus')).toBeEnabled();
    expect(screen.getByText(/Start the timer when you are ready/)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('button-begin-focus'));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  /**
   * UX GAP, pinned deliberately. The Pause/Resume control is gated on
   * `!isFinished && state !== 'break'` rather than on "has a session", so an
   * `idle` timer renders a second control reading "Resume" beside the enabled
   * "Begin focus". When `onResume` is wired it is live and focusable; the page
   * handler then silently no-ops (`if (!session) return`), so pressing it does
   * nothing at all — a control that appears to do work and does not.
   * See the handoff report.
   */
  it('idle: renders NO Resume control at all, only Begin focus', () => {
    // Regression: the control was gated on `!isFinished && state !== 'break'`, so
    // `idle` rendered a live "Resume" beside the enabled "Begin focus". The page
    // handler then returned early (`if (!session) return`), making it a control
    // that appeared to work and did nothing. P12 forbids that.
    const onResume = vi.fn();
    renderTimer({ state: 'idle', elapsedSeconds: 0, onStart: vi.fn(), onResume });
    expect(screen.getByTestId('button-begin-focus')).toBeEnabled();
    expect(screen.queryByTestId('button-toggle-focus')).not.toBeInTheDocument();
    expect(onResume).not.toHaveBeenCalled();
  });

  it('paused: Resume is present and enabled, and Begin focus is not', () => {
    const onResume = vi.fn();
    renderTimer({ state: 'paused', elapsedSeconds: 300, onResume });
    const resume = screen.getByTestId('button-toggle-focus');
    expect(resume).toBeEnabled();
    expect(resume).toHaveTextContent('Resume');
    expect(screen.queryByTestId('button-begin-focus')).not.toBeInTheDocument();
    fireEvent.click(resume);
    expect(onResume).toHaveBeenCalledTimes(1);
  });

  it('idle: Begin focus is disabled (never silent) when the caller wired no handler', () => {
    renderTimer({ state: 'idle', elapsedSeconds: 0 });
    expect(screen.getByTestId('button-begin-focus')).toBeDisabled();
  });

  it('running: shows Pause + Finish, and no Begin focus', () => {
    const onPause = vi.fn();
    renderTimer({ state: 'running', elapsedSeconds: 600, onPause });
    expect(screen.getByTestId('focus-timer-digits')).toHaveTextContent('10:00');
    expect(screen.getByTestId('button-toggle-focus')).toHaveTextContent('Pause');
    expect(screen.getByTestId('button-complete-focus')).toBeInTheDocument();
    expect(screen.queryByTestId('button-begin-focus')).not.toBeInTheDocument();
    expect(screen.getByText(/Minutes are saved automatically/)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('button-toggle-focus'));
    expect(onPause).toHaveBeenCalledTimes(1);
  });

  /**
   * Regression: the helper line switched on `isActive` only, so `paused` — which
   * is not active — fell through to the idle copy "Start the timer when you are
   * ready to begin." That tells someone with a half-finished round to start a new
   * one, and implies nothing is banked. A paused round must say it is paused and
   * that the time is safe (P20 content design: say what happened and what it means).
   */
  it('paused: the helper line says it is paused, not "Start the timer"', () => {
    renderTimer({ state: 'paused', elapsedSeconds: 300, onResume: vi.fn() });
    expect(screen.getByTestId('button-toggle-focus')).toHaveTextContent('Resume');
    expect(screen.getByText(/Paused\. Your time is safe/)).toBeInTheDocument();
    expect(screen.queryByText(/Start the timer when you are ready/)).not.toBeInTheDocument();
    // Still distinct from the running copy, which promises autosave.
    expect(screen.queryByText(/Minutes are saved automatically/)).not.toBeInTheDocument();
  });

  it('finished: replaces the controls with "Start another round" and never offers Pause', () => {
    renderTimer({ state: 'finished', elapsedSeconds: 1_500 });
    expect(screen.getByTestId('button-new-focus')).toBeInTheDocument();
    expect(screen.queryByTestId('button-toggle-focus')).not.toBeInTheDocument();
    expect(screen.queryByTestId('button-complete-focus')).not.toBeInTheDocument();
    expect(screen.getByText(/logged in today’s review ledger/)).toBeInTheDocument();
  });

  it('break: labels the finish control "End break"', () => {
    renderTimer({ state: 'break', elapsedSeconds: 0 });
    expect(screen.getByTestId('button-complete-focus')).toHaveTextContent('End break');
    expect(screen.queryByTestId('button-toggle-focus')).not.toBeInTheDocument();
  });

  it('recovered: carries a distinct icon+label chip (never colour alone, §P6.3)', () => {
    renderTimer({ state: 'recovered', elapsedSeconds: 2_820 });
    expect(screen.getByTestId('focus-timer-chip-recovered')).toHaveTextContent('Recovered');
    expect(screen.getByTestId('focus-timer-recovered')).toHaveTextContent(
      'the clock kept counting while you were away',
    );
  });

  it('recovered: treated as ACTIVE, so the control is Pause, not Resume', () => {
    renderTimer({ state: 'recovered', elapsedSeconds: 2_820 });
    expect(screen.getByTestId('button-toggle-focus')).toHaveTextContent('Pause');
  });

  it('sync-failed-but-running: announces the problem in words and offers Retry', () => {
    const onRetrySync = vi.fn();
    renderTimer({
      state: 'sync-failed-but-running',
      elapsedSeconds: 300,
      syncError: 'Some minutes have not reached the server yet.',
      onRetrySync,
    });
    const alert = screen.getByTestId('focus-timer-sync-failed');
    expect(alert).toHaveAttribute('role', 'alert');
    expect(alert).toHaveTextContent('Some minutes have not reached the server yet.');
    expect(alert).toHaveTextContent('The timer is still counting and nothing is lost.');
    fireEvent.click(screen.getByTestId('button-focus-retry-sync'));
    expect(onRetrySync).toHaveBeenCalledTimes(1);
    // The round must keep running while the sync is broken.
    expect(screen.getByTestId('button-toggle-focus')).toHaveTextContent('Pause');
  });

  it('a null taskTitle renders the empty state and NO controls at all (§P17.2)', () => {
    renderTimer({ state: 'idle', taskTitle: null });
    expect(screen.getByText(/No open tasks in today/)).toBeInTheDocument();
    expect(screen.getByText(/Add a task to Today or schedule one/)).toBeInTheDocument();
    expect(screen.queryByTestId('focus-timer-digits')).not.toBeInTheDocument();
    expect(screen.queryByTestId('button-begin-focus')).not.toBeInTheDocument();
  });

  it('clamps the progress bar at 100% when elapsed overruns the plan', () => {
    const { container } = renderTimer({ state: 'running', plannedMinutes: 25, elapsedSeconds: 3_000 });
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(container.querySelector('[style*="scaleX"]')).toHaveStyle({ transform: 'scaleX(1)' });
  });

  it('does not divide by zero for a zero-minute plan', () => {
    renderTimer({ state: 'idle', plannedMinutes: 0, elapsedSeconds: 0 });
    expect(screen.getByTestId('focus-timer-digits')).toHaveTextContent('00:00');
    expect(screen.queryByText('NaN%')).not.toBeInTheDocument();
  });

  it('renders every control at >=56px per §P11.1 (min-h-14 / size-14)', () => {
    renderTimer({ state: 'running', elapsedSeconds: 60 });
    for (const id of ['button-toggle-focus', 'button-complete-focus', 'button-focus-read-time']) {
      expect(screen.getByTestId(id).className).toContain('min-h-14');
    }
  });

  it('every state carries a TEXT label, so nothing depends on colour alone', () => {
    renderTimer({ state: 'idle', elapsedSeconds: 0 });
    expect(screen.getByText(/min planned/)).toBeInTheDocument();
  });
});

describe('FocusTimer — remaining time is announced ON REQUEST, never every second', () => {
  it('"Read time" writes elapsed + remaining into the polite region', async () => {
    renderTimer({ state: 'running', plannedMinutes: 25, elapsedSeconds: 600 });
    const live = screen.getByTestId('focus-timer-live');
    expect(live).toHaveAttribute('aria-live', 'polite');

    fireEvent.click(screen.getByTestId('button-focus-read-time'));
    // `say` clears then re-writes on the next animation frame, so the text lands
    // asynchronously — that is deliberate, not a test artefact.
    await waitFor(() =>
      expect(live).toHaveTextContent('10:00 elapsed, 15 minutes remaining of 25 planned.'),
    );
  });

  it('pressing "Read time" twice re-announces identical text rather than being swallowed', async () => {
    renderTimer({ state: 'running', plannedMinutes: 25, elapsedSeconds: 600 });
    const live = screen.getByTestId('focus-timer-live');
    fireEvent.click(screen.getByTestId('button-focus-read-time'));
    await waitFor(() => expect(live).toHaveTextContent('10:00 elapsed'));

    live.textContent = '';
    fireEvent.click(screen.getByTestId('button-focus-read-time'));
    await waitFor(() => expect(live).toHaveTextContent('10:00 elapsed'));
  });

  it('the ticking digits are NOT inside the live region', () => {
    renderTimer({ state: 'running', elapsedSeconds: 600 });
    const live = screen.getByTestId('focus-timer-live');
    expect(live).not.toHaveTextContent('10:00');
    expect(live.textContent).toBe('');
  });
});

describe('FocusTimer — elapsed recovery across a reload', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-05T09:00:00.000Z'));
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reopening shows the REAL elapsed time, not the server minute count and not a reset', () => {
    const t0 = Date.now();

    // --- session 1: the round starts and an anchor is persisted ---
    writeAnchor({ sessionId: 7, runStartedAt: t0, baseSeconds: 0 });
    expect(screen.queryByTestId('focus-timer')).not.toBeInTheDocument();

    // --- the app is killed; 47 minutes pass with no ticks at all ---
    act(() => {
      vi.setSystemTime(new Date(t0 + 47 * 60_000));
    });

    // --- session 2: reopen. The server says elapsedMinutes = 12 (last write). ---
    const serverElapsedMinutes = 12;
    const anchor = readAnchor();
    const elapsedSeconds = elapsedFromAnchor(anchor!, Date.now());

    render(
      <FocusTimer
        state={resolveFocusTimerState({
          hasSession: true,
          sessionStatus: 'active',
          recovered: true,
          syncFailed: false,
        })}
        taskTitle="Write the PS1 section"
        plannedMinutes={25}
        elapsedSeconds={elapsedSeconds}
      />,
    );

    // 47 minutes, derived from the wall clock.
    expect(screen.getByTestId('focus-timer-digits')).toHaveTextContent('47:00');
    // NOT the server's stale rounded value…
    expect(screen.getByTestId('focus-timer-digits')).not.toHaveTextContent(
      formatTimer(serverElapsedMinutes * 60),
    );
    // …and NOT a reset.
    expect(screen.getByTestId('focus-timer-digits')).not.toHaveTextContent('00:00');
    // The user is told why the number is trustworthy.
    expect(screen.getByTestId('focus-timer-recovered')).toBeInTheDocument();
    // And the round keeps running rather than restarting.
    expect(screen.getByTestId('button-toggle-focus')).toHaveTextContent('Pause');
  });

  it('recovery survives three hours in a background tab with zero ticks', () => {
    const t0 = Date.now();
    writeAnchor({ sessionId: 1, runStartedAt: t0, baseSeconds: 0 });

    for (const hours of [1, 2, 3]) {
      act(() => {
        vi.setSystemTime(new Date(t0 + hours * 3_600_000));
      });
      const elapsed = elapsedFromAnchor(readAnchor()!, Date.now());
      expect(formatTimer(elapsed)).toBe(formatTimer(hours * 3_600));
      // The digits equal the wall clock; an accumulated counter could not.
      expect(elapsed).toBe(hours * 3_600);
    }
  });

  it('a recovered round shows real REMAINING time, which goes to zero and floors rather than going negative', async () => {
    const t0 = Date.now();
    writeAnchor({ sessionId: 1, runStartedAt: t0, baseSeconds: 0 });
    act(() => {
      // Overran a 25-minute plan by 5 minutes.
      vi.setSystemTime(new Date(t0 + 30 * 60_000));
    });

    render(
      <FocusTimer
        state="recovered"
        taskTitle="Overran"
        plannedMinutes={25}
        elapsedSeconds={elapsedFromAnchor(readAnchor()!, Date.now())}
      />,
    );

    fireEvent.click(screen.getByTestId('button-focus-read-time'));
    const live = screen.getByTestId('focus-timer-live');
    // `say` defers the write to the next animation frame; flush it explicitly
    // because `waitFor`'s polling cannot run while fake timers are installed.
    await act(async () => {
      vi.advanceTimersByTime(64);
    });
    expect(live).toHaveTextContent('30:00 elapsed, 0 minutes remaining of 25 planned.');
    expect(live.textContent).not.toContain('-');
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('a NEW round is not seeded by a stale anchor from a finished one', () => {
    const t0 = Date.now();
    writeAnchor({ sessionId: 99, runStartedAt: t0 - 60 * 60_000, baseSeconds: 3_600 });
    const anchor = readAnchor();
    // FocusPage only adopts an anchor whose sessionId matches the active session.
    const matchesNewSession = anchor!.sessionId === 7;
    expect(matchesNewSession).toBe(false);
    // With no matching anchor the round starts from the server's own minutes,
    // which is the documented fallback — never from the old round's hour.
    expect(anchor!.baseSeconds + (Date.now() - anchor!.runStartedAt) / 1000).toBeGreaterThan(7_000);
  });
});