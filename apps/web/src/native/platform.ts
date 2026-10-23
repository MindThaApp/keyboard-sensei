import { Capacitor } from "@capacitor/core";

/**
 * True inside the Android app (Capacitor), false in any browser, including the
 * installed PWA. Native-only code paths branch on this.
 */
export const isNativeApp = (): boolean => Capacitor.isNativePlatform();
