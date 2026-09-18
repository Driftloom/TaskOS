import { normalizeTimeZone } from "./date";

/** Calendar day key (YYYY-MM-DD) of an instant in the given zone. */
export function dayKeyInZone(at: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: normalizeTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * Focus streak computation (pure, unit-tested).
 *
 * A streak counts consecutive calendar days (in the user's timezone) ending
 * today — or yesterday, so a streak never dies before the day is over —
 * with at least one COMPLETED focus round. Paused-but-unfinished sessions
 * do not extend a streak; only finished rounds count.
 *
 * Input is a set of `YYYY-MM-DD` day keys with completions (the route builds
 * them from started_at in one query) plus today's key. Output is the streak
 * length, capped only by history.
 */
export function computeStreak(dayKeys: Set<string>, todayKey: string): number {
  const has = (key: string) => dayKeys.has(key);
  // A streak stays alive through today: start counting from today when it
  // has a completion, else from yesterday.
  let cursor = todayKey;
  if (!has(cursor)) {
    cursor = shiftDay(cursor, -1);
    if (!has(cursor)) return 0;
  }
  let streak = 0;
  while (has(cursor)) {
    streak += 1;
    cursor = shiftDay(cursor, -1);
  }
  return streak;
}

function shiftDay(key: string, delta: number): string {
  const [year, month, day] = key.split("-").map(Number);
  const rolled = new Date(Date.UTC(year, month - 1, day + delta));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${rolled.getUTCFullYear()}-${pad(rolled.getUTCMonth() + 1)}-${pad(rolled.getUTCDate())}`;
}
