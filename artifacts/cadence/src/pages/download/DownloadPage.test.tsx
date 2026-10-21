import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DownloadPage } from './DownloadPage';
import { ANDROID_BUILD_INFO } from '@/lib/android-build-info';
import { APP_VERSION_INFO } from '@/lib/version-info';

/**
 * The public /download page is where a user decides whether to install the
 * APK. It used to print the WEB APP's version and build number in the Android
 * card, so an installer who checked Android App info saw a different number
 * from the one the page claimed. These assertions pin the Android card to the
 * APK's own manifest values and keep the web app's version labelled as such.
 */
describe('DownloadPage — the Android card tells the truth about the APK', () => {
  it('prints the APK version from its manifest, not the web app version', () => {
    render(<DownloadPage />);
    const androidRow = screen.getByTestId('download-android-version');
    expect(androidRow).toHaveTextContent(ANDROID_BUILD_INFO.versionName);
    expect(androidRow).toHaveTextContent(`Build ${ANDROID_BUILD_INFO.versionCode}`);
    expect(androidRow).not.toHaveTextContent(APP_VERSION_INFO.version);
  });

  it('labels the web app version as the web app version', () => {
    render(<DownloadPage />);
    expect(screen.getByTestId('download-web-version')).toHaveTextContent(
      `v${APP_VERSION_INFO.version}`,
    );
  });

  it('prints the APK size from the shipped file size', () => {
    render(<DownloadPage />);
    expect(screen.getByTestId('download-android-size')).toHaveTextContent(
      `${(ANDROID_BUILD_INFO.sizeBytes / 1024 / 1024).toFixed(2)} MB`,
    );
  });
});
