import { describe, expect, it } from 'vitest';
import { statSync } from 'node:fs';
import path from 'node:path';
import { ANDROID_BUILD_INFO } from './android-build-info';
import { APP_VERSION_INFO } from './version-info';

/**
 * The APK and the web app are two different artifacts with two different
 * version numbers. The web app's version lives in `version-info.ts`; the APK's
 * lives in `android-build-info.ts` and is read out of the APK's own
 * AndroidManifest.xml. These assertions stop the two from drifting into one
 * another — the constant has to describe the file that actually ships.
 */
const APK_PATH = path.resolve(import.meta.dirname, '../../public/cadence.apk');

describe('ANDROID_BUILD_INFO', () => {
  it('is the size of the APK that actually ships', () => {
    expect(ANDROID_BUILD_INFO.sizeBytes).toBe(statSync(APK_PATH).size);
  });

  it('describes the shipped APK, not the web app', () => {
    expect(ANDROID_BUILD_INFO.versionName).not.toBe(APP_VERSION_INFO.version);
    expect(ANDROID_BUILD_INFO.versionCode).toBeGreaterThan(0);
    expect(ANDROID_BUILD_INFO.sizeBytes).toBeGreaterThan(0);
  });
});
