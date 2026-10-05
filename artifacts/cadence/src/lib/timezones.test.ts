import { describe, expect, it } from 'vitest';
import {
  filterTimezones,
  getAllSupportedTimezones,
  getTimezoneAbbr,
  getTimezoneCurrentTime,
  getTimezoneOffset,
  resolveTimezoneAlias,
} from './timezones';

describe('timezones utilities', () => {
  it('returns all supported timezones as a non-empty array', () => {
    const list = getAllSupportedTimezones();
    expect(list.length).toBeGreaterThan(15);
    expect(list).toContain('Asia/Kolkata');
    expect(list).toContain('America/New_York');
    expect(list).toContain('Europe/London');
    expect(list).toContain('UTC');
  });

  it('correctly calculates UTC offset for Asia/Kolkata', () => {
    const offset = getTimezoneOffset('Asia/Kolkata');
    expect(offset).toMatch(/^UTC\+5:30|^UTC\+05:30/);
  });

  it('correctly calculates UTC offset for UTC', () => {
    const offset = getTimezoneOffset('UTC');
    expect(offset).toBe('UTC');
  });

  it('returns valid local time string', () => {
    const timeStr = getTimezoneCurrentTime('Asia/Kolkata');
    expect(timeStr).toMatch(/\d{1,2}:\d{2}\s?(AM|PM)/i);
  });

  it('resolves abbreviations and city aliases to canonical IANA IDs', () => {
    expect(resolveTimezoneAlias('ist')).toBe('Asia/Kolkata');
    expect(resolveTimezoneAlias('IST')).toBe('Asia/Kolkata');
    expect(resolveTimezoneAlias('india')).toBe('Asia/Kolkata');
    expect(resolveTimezoneAlias('calcutta')).toBe('Asia/Kolkata');
    expect(resolveTimezoneAlias('est')).toBe('America/New_York');
    expect(resolveTimezoneAlias('pst')).toBe('America/Los_Angeles');
    expect(resolveTimezoneAlias('gmt')).toBe('Europe/London');
    expect(resolveTimezoneAlias('utc')).toBe('UTC');
    expect(resolveTimezoneAlias('invalid_xyz_123')).toBeNull();
  });

  it('filters timezones with matching query', () => {
    const kolkataMatches = filterTimezones('kolkata');
    expect(kolkataMatches.length).toBeGreaterThan(0);
    expect(kolkataMatches[0].id).toBe('Asia/Kolkata');

    const istMatches = filterTimezones('IST');
    expect(istMatches.length).toBeGreaterThan(0);
    expect(istMatches[0].id).toBe('Asia/Kolkata');

    const londonMatches = filterTimezones('London');
    expect(londonMatches.length).toBeGreaterThan(0);
    expect(londonMatches[0].id).toBe('Europe/London');
  });

  it('returns popular timezones when query is empty', () => {
    const popular = filterTimezones('');
    expect(popular.length).toBeGreaterThan(10);
    const ids = popular.map((p) => p.id);
    expect(ids).toContain('Asia/Kolkata');
    expect(ids).toContain('America/New_York');
    expect(ids).toContain('UTC');
  });
});
