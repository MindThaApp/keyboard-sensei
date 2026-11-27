import { registerPlugin } from "@capacitor/core";
import { isNativeApp } from "../../native/platform";

/**
 * Mic permission, asked only when the learner opens a mic feature and only after
 * the explanation screen (docs/specs/MUSIC-PORTAL.md 4.7).
 *
 * - Android app: RECORD_AUDIO through the MicPermission plugin first, so the system
 *   prompt follows our explanation; the Capacitor bridge then grants the WebView's
 *   getUserMedia request by itself.
 * - Browsers (and the Windows app's WebView2): the getUserMedia prompt is the
 *   permission prompt; the Permissions API, where present, tells us beforehand
 *   whether it was already refused.
 *
 * Denial never affects anything else: every MIDI feature keeps working.
 */

export type MicPermissionState = "granted" | "prompt" | "denied" | "unsupported";

type NativeState = "granted" | "denied" | "prompt" | "prompt-with-rationale";
interface MicPermissionPlugin {
  checkPermissions(): Promise<{ microphone: NativeState }>;
  requestPermissions(options?: { permissions: "microphone"[] }): Promise<{ microphone: NativeState }>;
  openAppSettings(): Promise<{ opened: boolean }>;
}

/** android/app/src/main/java/com/midivory/app/mic/MicPermissionPlugin.kt */
const NativeMicPermission = registerPlugin<MicPermissionPlugin>("MicPermission");

const fromNative = (state: NativeState): MicPermissionState => (state === "granted" ? "granted" : state === "denied" ? "denied" : "prompt");

export interface MicPermissionDeps {
  native: boolean;
  plugin: MicPermissionPlugin;
  permissions?: Pick<Permissions, "query">;
  hasGetUserMedia: boolean;
}

const defaultDeps = (): MicPermissionDeps => ({
  native: isNativeApp(),
  plugin: NativeMicPermission,
  permissions: typeof navigator !== "undefined" ? navigator.permissions : undefined,
  hasGetUserMedia: typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia,
});

/** The state before asking: "denied" means the prompt will not appear again (show how to re-enable). */
export async function checkMicPermission(deps: MicPermissionDeps = defaultDeps()): Promise<MicPermissionState> {
  if (!deps.hasGetUserMedia) return "unsupported";
  if (deps.native) {
    try { return fromNative((await deps.plugin.checkPermissions()).microphone) } catch { return "prompt" }
  }
  try {
    const status = await deps.permissions?.query({ name: "microphone" as PermissionName });
    if (status) return status.state === "granted" ? "granted" : status.state === "denied" ? "denied" : "prompt";
  } catch {
    // Firefox and older Safari do not know "microphone" here; getUserMedia will ask.
  }
  return "prompt";
}

/**
 * Asks for the permission where the platform has a separate step (Android). In
 * browsers this resolves "prompt" and getUserMedia shows the prompt itself.
 */
export async function requestMicPermission(deps: MicPermissionDeps = defaultDeps()): Promise<MicPermissionState> {
  if (!deps.hasGetUserMedia) return "unsupported";
  if (!deps.native) return checkMicPermission(deps);
  try {
    return fromNative((await deps.plugin.requestPermissions({ permissions: ["microphone"] })).microphone);
  } catch {
    return "denied";
  }
}

export type MicSettingsHelp = { kind: "app-settings" } | { kind: "windows-settings"; href: string } | { kind: "browser"; text: string };

/** How to turn a refused microphone back on, per platform. */
export function micSettingsHelp(deps: Pick<MicPermissionDeps, "native"> = defaultDeps(), userAgent = typeof navigator !== "undefined" ? navigator.userAgent : ""): MicSettingsHelp {
  if (deps.native) return { kind: "app-settings" };
  const inWindowsApp = typeof window !== "undefined" && !!(window as unknown as { chrome?: { webview?: unknown } }).chrome?.webview;
  if (inWindowsApp) return { kind: "windows-settings", href: "ms-settings:privacy-microphone" };
  const browser = /Firefox\//.test(userAgent) ? "the microphone icon in the address bar" : /Safari\//.test(userAgent) && !/Chrome\//.test(userAgent) ? "Safari > Settings for This Website" : "the site settings icon left of the address";
  return { kind: "browser", text: `Allow the microphone for this site using ${browser}, then try again.` };
}

export async function openMicAppSettings(plugin: MicPermissionPlugin = NativeMicPermission): Promise<boolean> {
  try { return (await plugin.openAppSettings()).opened } catch { return false }
}
