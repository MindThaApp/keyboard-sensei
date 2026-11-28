import { Capacitor } from "@capacitor/core";
import { isWindowsApp as isWindowsAppHost } from "./windowsHost";

/**
 * True inside the Android app (Capacitor), false in any browser, including the
 * installed PWA. Native-only code paths branch on this.
 */
export const isNativeApp = (): boolean => Capacitor.isNativePlatform();

export { isWindowsApp } from "./windowsHost";

/** Which shell the page runs in: the Android app, the Windows app, or a browser. */
export type HostPlatform = "android" | "windows" | "web";
export const hostPlatform = (): HostPlatform => (isNativeApp() ? "android" : isWindowsAppHost() ? "windows" : "web");
