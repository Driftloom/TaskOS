/**
 * Describes artifacts/cadence/public/cadence.apk, NOT the web app.
 *
 * The APK is built by a separate Android toolchain and carries its own
 * versionCode/versionName. The web app's version is a different number and
 * must never be printed as though it were the APK's -- an installer reads
 * the APK's manifest in Android App info and sees a different value.
 *
 * Bump these when the APK is rebuilt. Verify against the manifest, not from
 * memory: see docs/superpowers/plans/2026-10-20-release-integrity-and-truthfulness.md
 * Task 2 Step 1.
 */
export const ANDROID_BUILD_INFO = {
  /** android:versionName from the APK's AndroidManifest.xml. */
  versionName: '1.0.0.0',
  /** android:versionCode from the APK's AndroidManifest.xml. */
  versionCode: 1,
  /** Size of artifacts/cadence/public/cadence.apk in bytes, as shipped. */
  sizeBytes: 1267976,
} as const;
