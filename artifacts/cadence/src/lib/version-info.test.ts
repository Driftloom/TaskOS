import { describe, it, expect } from 'vitest';
import pkg from '../../package.json';
import { APP_VERSION_INFO } from './version-info';

describe('APP_VERSION_INFO integrity', () => {
  it('matches the app package version', () => {
    expect(APP_VERSION_INFO.version).toBe(pkg.version);
  });

  it('does not advertise both the bottom dock and the drawer', () => {
    const text = APP_VERSION_INFO.highlights.map((h) => `${h.title} ${h.description}`).join(' ');
    // A drawer entry may legitimately say which dock it replaced, so only a
    // claim that the bottom dock is *still* the shipped chrome is a contradiction.
    const claimsDockUnchanged = /bottom-only chrome|dock unchanged/i.test(text);
    const mentionsDrawer = /drawer/i.test(text);
    expect(claimsDockUnchanged && mentionsDrawer).toBe(false);
  });

  it('has a non-empty highlight list', () => {
    expect(APP_VERSION_INFO.highlights.length).toBeGreaterThan(0);
  });
});
