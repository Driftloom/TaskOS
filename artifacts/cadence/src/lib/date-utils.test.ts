import { describe, expect, it } from 'vitest';
import {
  dateHeading,
  dateKey,
  formatTimer,
  fromLocalDatetimeInput,
  plural,
  shortTime,
  timezone,
  today,
  toLocalDatetimeInput,
} from './date-utils';

describe('date-utils — time and timezone robustness', () => {
  it('timezone() returns a valid non-empty IANA string', () => {
    const tz = timezone();
    expect(typeof tz).toBe('string');
    expect(tz.length).toBeGreaterThan(0);
  });

  it('today() returns YYYY-MM-DD format for different valid timezones', () => {
    const kolkata = today('Asia/Kolkata');
    const newYork = today('America/New_York');
    const utc = today('UTC');

    expect(kolkata).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(newYork).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(utc).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('dateKey() matches YYYY-MM-DD format', () => {
    const d = new Date('2026-10-04T12:00:00.000Z');
    const key = dateKey(d, 'UTC');
    expect(key).toBe('2026-10-04');
  });

  it('toLocalDatetimeInput and fromLocalDatetimeInput round-trip without shifting', () => {
    const isoUtc = '2026-10-04T12:00:00.000Z';
    const localInput = toLocalDatetimeInput(isoUtc);

    // Should be in format YYYY-MM-DDTHH:mm
    expect(localInput).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);

    const roundTripped = fromLocalDatetimeInput(localInput);
    expect(roundTripped).toBeDefined();

    // The timestamp millisecond value should match exactly (up to minute precision)
    const originalTime = Math.floor(new Date(isoUtc).getTime() / 60_000);
    const roundTrippedTime = Math.floor(new Date(roundTripped!).getTime() / 60_000);
    expect(roundTrippedTime).toBe(originalTime);
  });

  it('toLocalDatetimeInput handles empty / null / undefined / invalid gracefully', () => {
    expect(toLocalDatetimeInput(null)).toBe('');
    expect(toLocalDatetimeInput(undefined)).toBe('');
    expect(toLocalDatetimeInput('')).toBe('');
    expect(toLocalDatetimeInput('invalid-date')).toBe('');
  });

  it('fromLocalDatetimeInput handles empty / null / undefined gracefully', () => {
    expect(fromLocalDatetimeInput(null)).toBeNull();
    expect(fromLocalDatetimeInput(undefined)).toBeNull();
    expect(fromLocalDatetimeInput('')).toBeNull();
  });

  it('shortTime formats valid timestamps into human-readable hours and minutes', () => {
    const result = shortTime('2026-10-04T12:00:00.000Z');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
    expect(shortTime(null)).toBe('');
  });

  it('formatTimer formats elapsed seconds as MM:SS', () => {
    expect(formatTimer(0)).toBe('00:00');
    expect(formatTimer(65)).toBe('01:05');
    expect(formatTimer(1500)).toBe('25:00');
  });

  it('plural pluralizes correctly', () => {
    expect(plural(1, 'task')).toBe('1 task');
    expect(plural(2, 'task')).toBe('2 tasks');
    expect(plural(0, 'task')).toBe('0 tasks');
  });
});
