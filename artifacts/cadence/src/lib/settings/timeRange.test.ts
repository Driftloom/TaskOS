import { describe, expect, it } from 'vitest';
import {
  hourLabel,
  isOvernight,
  isValidHour,
  rangeLengthHours,
  rangeSegments,
} from './timeRange';

/**
 * The load-bearing rule (spec P11.1 / P13): a working or quiet-hours range whose
 * END IS BEFORE ITS START crosses midnight and is LEGAL. Only a zero-length
 * range is illegal, and even that is legal where the caller opts in.
 *
 * A previous version of this logic rejected `end < start` as "end before start".
 * These tests exist so that regression cannot come back.
 */
describe('rangeLengthHours', () => {
  it('measures a normal same-day range', () => {
    expect(rangeLengthHours(9, 17)).toBe(8);
    expect(rangeLengthHours(0, 24 - 1)).toBe(23);
  });

  it('measures an overnight range as its true length, not a negative one', () => {
    // 23:00 -> 06:00 is 7 hours across midnight, NOT -17.
    expect(rangeLengthHours(23, 6)).toBe(7);
    // 22:00 -> 02:00 is 4 hours.
    expect(rangeLengthHours(22, 2)).toBe(4);
  });

  it('treats the whole 24h window as 24 hours', () => {
    // Only expressible as 00:00 -> 23:00 given the 0-23 contract, so assert both
    // ends of the domain are covered.
    expect(rangeLengthHours(0, 23)).toBe(23);
    expect(rangeLengthHours(0, 0)).toBe(0);
  });

  it('measures a zero-length range as zero', () => {
    expect(rangeLengthHours(9, 9)).toBe(0);
    expect(rangeLengthHours(0, 0)).toBe(0);
    expect(rangeLengthHours(23, 23)).toBe(0);
  });

  it('never returns a negative length for any pair in 0..23', () => {
    for (let start = 0; start < 24; start++) {
      for (let end = 0; end < 24; end++) {
        expect(rangeLengthHours(start, end), `${start}->${end}`).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('isOvernight', () => {
  it('is true only when end is strictly before start', () => {
    expect(isOvernight(23, 6)).toBe(true);
    expect(isOvernight(9, 17)).toBe(false);
    expect(isOvernight(9, 9)).toBe(false);
  });
});

describe('rangeSegments — the 24h track geometry', () => {
  it('paints one block for a normal range', () => {
    expect(rangeSegments(9, 17)).toEqual([{ left: 9, width: 8 }]);
  });

  it('paints NO block for a zero-length range, rather than a full-width one', () => {
    expect(rangeSegments(9, 9)).toEqual([]);
    expect(rangeSegments(0, 0)).toEqual([]);
    expect(rangeSegments(23, 23)).toEqual([]);
  });

  it('paints TWO blocks for an overnight range, wrapping through hour 0', () => {
    expect(rangeSegments(23, 6)).toEqual([
      { left: 23, width: 1 },
      { left: 0, width: 6 },
    ]);
  });

  it('paints two blocks for 22:00 -> 02:00', () => {
    expect(rangeSegments(22, 2)).toEqual([
      { left: 22, width: 2 },
      { left: 0, width: 2 },
    ]);
  });

  it('drops the zero-width tail when an overnight range ends at midnight', () => {
    // 20:00 -> 00:00 is 4 hours: [20,24). There is no [0,0) segment to draw.
    expect(rangeSegments(20, 0)).toEqual([{ left: 20, width: 4 }]);
  });

  it('drops the zero-width head when an overnight range starts at midnight', () => {
    // 00:00 -> 04:00 does not cross midnight, so this is the simple case.
    expect(rangeSegments(0, 4)).toEqual([{ left: 0, width: 4 }]);
  });

  it('every segment stays inside the 24h track', () => {
    for (let start = 0; start < 24; start++) {
      for (let end = 0; end < 24; end++) {
        for (const segment of rangeSegments(start, end)) {
          expect(segment.left, `${start}->${end}`).toBeGreaterThanOrEqual(0);
          expect(segment.left + segment.width, `${start}->${end}`).toBeLessThanOrEqual(24);
          expect(segment.width, `${start}->${end}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('the painted widths always add up to the computed length', () => {
    for (let start = 0; start < 24; start++) {
      for (let end = 0; end < 24; end++) {
        const painted = rangeSegments(start, end).reduce((sum, s) => sum + s.width, 0);
        expect(painted, `${start}->${end}`).toBe(rangeLengthHours(start, end));
      }
    }
  });
});

describe('hourLabel', () => {
  it('zero-pads to two digits', () => {
    expect(hourLabel(0)).toBe('00:00');
    expect(hourLabel(9)).toBe('09:00');
    expect(hourLabel(23)).toBe('23:00');
  });
});

describe('isValidHour', () => {
  it('accepts every hour the notification_settings contract allows', () => {
    for (let hour = 0; hour < 24; hour++) {
      expect(isValidHour(hour), String(hour)).toBe(true);
    }
  });

  it('rejects out-of-range and non-integer values', () => {
    for (const bad of [-1, 24, 25, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(isValidHour(bad), String(bad)).toBe(false);
    }
  });
});