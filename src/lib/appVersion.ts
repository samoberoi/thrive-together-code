import { Capacitor } from "@capacitor/core";

/** Keep in sync with package.json / android versionName / iOS CFBundleShortVersionString. */
export const APP_VERSION = "1.1.5";
export const APP_BUILD = "16";

export function appVersionLabel(): string {
  const platform = Capacitor.isNativePlatform() ? Capacitor.getPlatform() : "web";
  return `${APP_VERSION} (${APP_BUILD}) · ${platform}`;
}
