import { normalizeTimeZone } from "./date";
import { zonedWallToUtc, type ZoneCalendar } from "./natural-date";

/**
 * Reminder scheduling primitives (pure, fully unit-tested):
 * - Tier set: T-1 day, T-1 hour, at-time derived from a due date; tiers
 *   already past at creation are skipped, never backfilled.
 * - Quiet hours: a daily [start, end) window in the user's timezone that the
 *   dispatcher always respects (due reminders wait for the window to end,
 *   they are never dropped for being quiet). start == end disables quiet.
 * - Expiry: reminders more than MAX_OVERDUE old are canceled, not sent —
 *   the "capped overdue nudges" rule.
 */

export interface QuietWindow {
  quietStart: number;
  quietEnd: number;
  timeZone: string;
}

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
export const MAX_OVERDUE_MS = 7 * DAY_MS;

export function hourInZone(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: normalizeTimeZone(timeZone),
    hourCycle: "h23",
    hour: "2-digit",
  }).formatToParts(at);
  return Number(parts.find((part) => part.type === "hour")?.value);
}

function zoneCalendar(at: Date, timeZone: string): ZoneCalendar {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(at);
  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

function addDays(date: ZoneCalendar, delta: number): ZoneCalendar {
  const rolled = new Date(Date.UTC(date.year, date.month - 1, date.day + delta));
  return {
    year: rolled.getUTCFullYear(),
    month: rolled.getUTCMonth() + 1,
    day: rolled.getUTCDate(),
  };
}

export function inQuietHours(at: Date, window: QuietWindow): boolean {
  const zone = normalizeTimeZone(window.timeZone);
  const hour = hourInZone(at, zone);
  const { quietStart: start, quietEnd: end } = window;
  if (start === end) return false;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

/** Earliest instant >= `at` outside quiet hours (the quiet-end wall time in
 *  the user's zone, rolling to tomorrow when today's already passed). */
export function nextAllowedTime(at: Date, window: QuietWindow): Date {
  const zone = normalizeTimeZone(window.timeZone);
  if (!inQuietHours(at, { ...window, timeZone: zone })) return at;
  const today = zoneCalendar(at, zone);
  const candidate = zonedWallToUtc(today, window.quietEnd, 0, zone);
  if (candidate.getTime() <= at.getTime()) {
    return zonedWallToUtc(addDays(today, 1), window.quietEnd, 0, zone);
  }
  return candidate;
}

export interface TierSpec {
  name: "t_1day" | "t_1hour" | "at_time";
  at: Date;
}

export function computeTiers(dueAt: Date, now: Date): TierSpec[] {
  return (
    [
      { name: "t_1day", at: new Date(dueAt.getTime() - DAY_MS) },
      { name: "t_1hour", at: new Date(dueAt.getTime() - HOUR_MS) },
      { name: "at_time", at: new Date(dueAt.getTime()) },
    ] satisfies TierSpec[]
  ).filter((tier) => tier.at.getTime() > now.getTime());
}

export function isExpired(remindAt: Date, now: Date): boolean {
  return now.getTime() - remindAt.getTime() > MAX_OVERDUE_MS;
}
