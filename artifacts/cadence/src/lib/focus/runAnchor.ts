/**
 * Focus-round run anchor — the persistence half of §P11.1's "state survives
 * backgrounding and reopen".
 *
 * The bug this exists to prevent: reopening the app used to reset the focus
 * timer to the server's minute-rounded `elapsed_minutes`, so a round that had
 * really been going 47 minutes came back reading 12. Two pieces fix that, and
 * both live here so they can be tested without mounting `FocusPage` behind six
 * react-query hooks:
 *
 *  1. **A persisted anchor.** While a round is active, `runStartedAt` and
 *     `baseSeconds` are written to `localStorage`. A reopen reads them back and
 *     rebuilds the exact same delta.
 *  2. **Wall-clock derivation.** Elapsed time is always
 *     `baseSeconds + (now - runStartedAt)`. It is NEVER an accumulated counter,
 *     because a counter can be lost by a throttled or frozen interval; a
 *     wall-clock delta is immune to that and simply recomputes on resume.
 *
 * The server stays authoritative for the session itself (status, task, planned
 * minutes). The anchor is a local timing hint and is discarded the moment a
 * round pauses or completes.
 */

export const ANCHOR_KEY = 'cadence.focus.anchor.v1';

export interface RunAnchor {
  sessionId: number;
  /** `Date.now()` at the moment the current running leg began. */
  runStartedAt: number;
  /** Elapsed seconds banked before this running leg began. */
  baseSeconds: number;
}

/**
 * Read the anchor, or `null` when there is none, when the payload is malformed,
 * or when storage is unavailable (private mode / disabled). Never throws: a
 * missing anchor degrades to the server's minute-rounded value, which is
 * worse but not wrong.
 */
export function readAnchor(): RunAnchor | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(ANCHOR_KEY);
    if (!raw) return null;
    const parsed: Partial<RunAnchor> = JSON.parse(raw);
    if (
      typeof parsed.sessionId !== 'number' ||
      typeof parsed.runStartedAt !== 'number' ||
      typeof parsed.baseSeconds !== 'number' ||
      !Number.isFinite(parsed.sessionId) ||
      !Number.isFinite(parsed.runStartedAt) ||
      !Number.isFinite(parsed.baseSeconds)
    ) {
      return null;
    }
    return {
      sessionId: parsed.sessionId,
      runStartedAt: parsed.runStartedAt,
      baseSeconds: parsed.baseSeconds,
    };
  } catch {
    return null;
  }
}

/** Persist the anchor, or clear it when passed `null`. Never throws. */
export function writeAnchor(anchor: RunAnchor | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (anchor) window.localStorage.setItem(ANCHOR_KEY, JSON.stringify(anchor));
    else window.localStorage.removeItem(ANCHOR_KEY);
  } catch {
    // Non-fatal by design — see readAnchor.
  }
}

/**
 * Elapsed seconds for a round that has been running since `runStartedAt`,
 * derived from the wall clock rather than from accumulated ticks.
 *
 * `now` is an explicit parameter (rather than reading `Date.now()` inside) so
 * the recovery path can be driven deterministically in tests, and so both the
 * reopen path and the 1-second tick use exactly one implementation.
 */
export function elapsedFromAnchor(anchor: RunAnchor, now: number): number {
  const deltaSeconds = Math.floor((now - anchor.runStartedAt) / 1000);
  // A clock that moved backwards (NTP correction, timezone change) must never
  // rewind the user's round. Clamping the DELTA — rather than the sum — keeps
  // the already-banked seconds intact instead of zeroing the round, and also
  // guarantees elapsed is never negative (the pre-extraction inline expression
  // could return a negative number, which `formatTimer` would render as a
  // negative readout).
  return anchor.baseSeconds + Math.max(0, deltaSeconds);
}

/** Whole minutes of a seconds figure, floored — the unit the API stores. */
export function minutesOf(seconds: number): number {
  return Math.floor(seconds / 60);
}

/**
 * Whether an anchor belongs to the session we just adopted. A stale anchor from
 * a different (or already finished) round must never be used to seed elapsed
 * time, or a new round would inherit the old one's minutes.
 */
export function anchorMatches(anchor: RunAnchor | null, sessionId: number): boolean {
  return anchor !== null && anchor.sessionId === sessionId;
}