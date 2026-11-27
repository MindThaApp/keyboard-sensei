import type { WebViewChannel } from "@keyboard-sensei/midi-engine/windows";

/**
 * The Windows app (apps/windows) hosts this page in WebView2 and announces itself
 * before any page script runs (AddScriptToExecuteOnDocumentCreatedAsync), with:
 *   window.__musicPortalHost = { platform: "windows", version, midiBridge, protocol }
 * `midiBridge` is true only when the host's native MIDI started; otherwise the page
 * uses Web MIDI, which WebView2 also has.
 */
export interface WindowsHostInfo {
  platform: "windows";
  version: string;
  midiBridge: boolean;
  protocol: number;
}

type HostWindow = Window & {
  __musicPortalHost?: Partial<WindowsHostInfo>;
  chrome?: { webview?: WebViewChannel };
};

const hostWindow = (): HostWindow | null => (typeof window === "undefined" ? null : (window as HostWindow));

export function windowsHostInfo(): WindowsHostInfo | null {
  const info = hostWindow()?.__musicPortalHost;
  if (!info || info.platform !== "windows") return null;
  return { platform: "windows", version: String(info.version ?? ""), midiBridge: info.midiBridge === true, protocol: Number(info.protocol ?? 1) };
}

export const isWindowsApp = (): boolean => windowsHostInfo() !== null;

/** The WebView2 message channel, when the native MIDI bridge is up. */
export function windowsMidiChannel(): WebViewChannel | null {
  const info = windowsHostInfo();
  const channel = hostWindow()?.chrome?.webview;
  return info?.midiBridge && channel ? channel : null;
}

export type WindowsSettingsPage = "privacy-microphone" | "bluetooth";

/**
 * Opens a Windows Settings page (e.g. when Windows privacy settings block the
 * microphone). The host only accepts these fixed pages, never an arbitrary URI.
 */
export function openWindowsSettings(page: WindowsSettingsPage): boolean {
  const channel = hostWindow()?.chrome?.webview;
  if (!isWindowsApp() || !channel) return false;
  channel.postMessage({ type: "openSettings", page });
  return true;
}
