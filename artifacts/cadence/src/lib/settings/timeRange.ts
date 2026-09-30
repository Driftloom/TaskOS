/**
 * Working/quiet-hours range geometry.
 *
 * Extracted from `components/settings/SettingsPrimitives.tsx`, where these four
 * tiny functions lived inside a 809-line JSX file and were therefore untestable.
 *
 * The load-bearing rule they encode (P11.1 / P13): **a range whose end is
 * before its start is legal.** It means "crosses midnight" — quiet hours of
 * 23:00 → 06:00 — and is NOT a validation error. The only illegal range is a
 * zero-length one (start === end), and even that is legal where the caller says
 * it is (`allowEqual`, used by quiet hours to mean "window disabled").
 */

/** "07" -> "07:00". */
export function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

/** The contract accepts whole hours 0-23 only. */
export function isValidHour(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 23;
}

/** True when the range wraps past midnight (`end < start`). */
export function isOvernight(start: number, end: number): boolean {
  return end < start;
}

/**
 * Length of the window in hours. `start === end` is a zero-length window, which
 * is why the overnight branch is reached at all: 23:00 -> 06:00 is 7 hours, not
 * -17.
 */
export function rangeLengthHours(start: number, end: number): number {
  if (start === end) return 0;
  return isOvernight(start, end) ? 24 - start + end : end - start;
}

/**
 * Segments to paint on the 24h track. A range whose end is at or before its
 * start wraps midnight, so it becomes two blocks: [start, 24) and [0, end).
 */
export function rangeSegments(start: number, end: number): { left: number; width: number }[] {
  if (start === end) return [];
  if (end > start) return [{ left: start, width: end - start }];
  return [{ left: start, width: 24 - start }, { left: 0, width: end }].filter(
    (segment) => segment.width > 0,
  );
}