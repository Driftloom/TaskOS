import { describe, it, expect } from 'vitest';
import pkg from '../../package.json';
import { APP_VERSION_INFO } from './version-info';

// Titles that name a mobile chrome surface (chrome / dock / drawer). Only the
// title states which surface shipped: descriptions legitimately mention the
// dock they replaced, and unrelated entries mention the mobile dock in passing.
// "navigation" is deliberately not a trigger — "Sidebar Navigation Integrity
// Pass" is a desktop-sidebar fix, not a chrome-surface change.
const NAV_SURFACE_TITLE_RE = /chrome|dock|drawer|bottom nav/i;

describe('APP_VERSION_INFO integrity', () => {
  it('matches the app package version', () => {
    expect(APP_VERSION_INFO.version).toBe(pkg.version);
  });

  it('advertises at most one navigation-surface highlight', () => {
    const navTitles = APP_VERSION_INFO.highlights
      .filter((h) => NAV_SURFACE_TITLE_RE.test(h.title))
      .map((h) => h.title);
    expect(navTitles.length).toBeLessThanOrEqual(1);
  });

  it('has a non-empty highlight list', () => {
    expect(APP_VERSION_INFO.highlights.length).toBeGreaterThan(0);
  });
});
