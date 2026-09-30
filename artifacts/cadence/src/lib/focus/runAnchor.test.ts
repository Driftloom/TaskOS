import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ANCHOR_KEY,
  anchorMatches,
  elapsedFromAnchor,
  minutesOf,
  readAnchor,
  writeAnchor,
  type RunAnchor,
} from './runAnchor';

/**
 * Regression cover for the fixed bug: reopening the app used to RESET the focus
 * timer instead of recovering elapsed time. The fix is that a running round
 * persists a wall-clock start anchor and derives remaining time from the clock
 * (artifacts/cadence/src/pages/focus/FocusPage.tsx).
 *
 * The property that matters: elapsed time is a FUNCTION OF THE WALL CLOCK, not
 * of accumulated ticks. Every test below advances the fake clock without running
 * a single interval, which is exactly what a suspended tab / closed PWA does.
 * A counter-based implementation would return a frozen number here.
 */
describe('focus run anchor — elapsed is derived from the clock, not a counter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-05T09:00:00.000Z'));
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const start = () => Date.now();

  it('elapsedFromAnchor returns just the banked seconds at the instant the leg began', () => {
    const anchor: RunAnchor = { sessionId: 7, runStartedAt: start(), baseSeconds: 120 };
    expect(elapsedFromAnchor(anchor, start())).toBe(120);
  });

  it('recovers the REAL elapsed time across a reload with no ticks in between', () => {
    const t0 = start();

    // --- session 1: the user starts a round and works for 47 minutes ---
    writeAnchor({ sessionId: 7, runStartedAt: t0, baseSeconds: 0 });

    // The app is killed. No interval ever fires again; the clock simply moves.
    vi.setSystemTime(new Date(t0 + 47 * 60_000));

    // --- session 2: reopen ---
    const anchor = readAnchor();
    expect(anchor).not.toBeNull();
    expect(anchorMatches(anchor, 7)).toBe(true);
    expect(elapsedFromAnchor(anchor!, start())).toBe(47 * 60);
  });

  it('adds banked time from earlier legs to the current one', () => {
    const t0 = start();
    // Worked 10 minutes, paused, then resumed — baseSeconds banks the first leg.
    writeAnchor({ sessionId: 7, runStartedAt: t0, baseSeconds: 600 });
    vi.setSystemTime(new Date(t0 + 5 * 60_000));
    expect(elapsedFromAnchor(readAnchor()!, start())).toBe(900);
  });

  it('is immune to a suspended tab: 3 hours of wall clock count as 3 hours', () => {
    const t0 = start();
    writeAnchor({ sessionId: 1, runStartedAt: t0, baseSeconds: 0 });

    // A frozen interval fires zero times across the whole gap. Only the clock moved.
    vi.setSystemTime(new Date(t0 + 3 * 3_600_000));

    const recovered = elapsedFromAnchor(readAnchor()!, start());
    expect(recovered).toBe(3 * 3_600);
    // The regression this guards: the pre-fix code reset to the server's
    // minute-rounded `elapsed_minutes`, which at a 1-minute write interval would
    // have been at most 1 minute.
    expect(minutesOf(recovered)).toBe(180);
  });

  it('a whole number of hours recovers with no sub-second drift', () => {
    const t0 = start();
    writeAnchor({ sessionId: 1, runStartedAt: t0, baseSeconds: 0 });
    for (const hours of [1, 2, 5, 8]) {
      vi.setSystemTime(new Date(t0 + hours * 3_600_000));
      expect(elapsedFromAnchor(readAnchor()!, start())).toBe(hours * 3_600);
    }
  });

  it('floors partial seconds rather than rounding up, so it never over-reports', () => {
    const t0 = start();
    const anchor: RunAnchor = { sessionId: 1, runStartedAt: t0, baseSeconds: 0 };
    expect(elapsedFromAnchor(anchor, t0 + 1_999)).toBe(1);
    expect(elapsedFromAnchor(anchor, t0 + 59_400)).toBe(59);
  });

  it('never rewinds when the clock jumps backwards', () => {
    const t0 = start();
    const anchor: RunAnchor = { sessionId: 1, runStartedAt: t0, baseSeconds: 300 };
    // NTP correction / user changed the system clock.
    expect(elapsedFromAnchor(anchor, t0 - 10 * 60_000)).toBe(300);
  });

  it('advances monotonically as the clock advances', () => {
    const t0 = start();
    const anchor: RunAnchor = { sessionId: 1, runStartedAt: t0, baseSeconds: 0 };
    let previous = -1;
    for (let seconds = 0; seconds <= 600; seconds += 25) {
      const value = elapsedFromAnchor(anchor, t0 + seconds * 1000);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
    expect(previous).toBe(600);
  });
});

describe('focus run anchor — persistence', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('round-trips through localStorage under the versioned key', () => {
    const anchor: RunAnchor = { sessionId: 42, runStartedAt: 1_700_000_000_000, baseSeconds: 900 };
    writeAnchor(anchor);
    expect(window.localStorage.getItem(ANCHOR_KEY)).toBeTruthy();
    expect(readAnchor()).toEqual(anchor);
  });

  it('writeAnchor(null) clears it, which is what pause and finish do', () => {
    writeAnchor({ sessionId: 1, runStartedAt: 1, baseSeconds: 1 });
    writeAnchor(null);
    expect(window.localStorage.getItem(ANCHOR_KEY)).toBeNull();
    expect(readAnchor()).toBeNull();
  });

  it('returns null when there is nothing stored', () => {
    expect(readAnchor()).toBeNull();
  });

  it.each([
    ['not JSON at all', '{{{'],
    ['a JSON array', '[]'],
    ['a missing field', '{"sessionId":1,"runStartedAt":5}'],
    ['a null field', '{"sessionId":null,"runStartedAt":5,"baseSeconds":0}'],
    ['a string field', '{"sessionId":"1","runStartedAt":5,"baseSeconds":0}'],
    ['a NaN-ish value', '{"sessionId":1,"runStartedAt":"nope","baseSeconds":0}'],
  ])('returns null for a corrupt payload (%s) rather than seeding a bogus clock', (_label, raw) => {
    window.localStorage.setItem(ANCHOR_KEY, raw);
    expect(readAnchor()).toBeNull();
  });

  it('rejects an anchor belonging to a different session, so a new round cannot inherit old minutes', () => {
    const anchor: RunAnchor = { sessionId: 7, runStartedAt: 0, baseSeconds: 3_600 };
    expect(anchorMatches(anchor, 8)).toBe(false);
    expect(anchorMatches(anchor, 7)).toBe(true);
    expect(anchorMatches(null, 7)).toBe(false);
  });

  it('a corrupt anchor is discarded, leaving the round to fall back to elapsedMinutes rather than crash', () => {
    window.localStorage.setItem(ANCHOR_KEY, 'oops');
    expect(anchorMatches(readAnchor(), 7)).toBe(false);
  });
});

describe('minutesOf — the unit the API stores', () => {
  it('floors, matching the server-side minute rounding', () => {
    expect(minutesOf(0)).toBe(0);
    expect(minutesOf(59)).toBe(0);
    expect(minutesOf(60)).toBe(1);
    expect(minutesOf(2_820)).toBe(47);
  });
});