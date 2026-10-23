/**
 * Fullscreen and system-bar helpers for focus mode. Everything is best effort: a
 * browser (iPhone Safari) or a native shell without the capability simply reports
 * `false` and focus mode still works, it just leaves the system chrome where it is.
 */

type PluginMethods = Record<string, (() => unknown) | undefined>;

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  Plugins?: Record<string, PluginMethods | undefined>;
}

function capacitor(): CapacitorGlobal | undefined {
  return (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
}

const isNative = (): boolean => capacitor()?.isNativePlatform?.() === true;

/** Calls a native plugin method if the wrapper app ships it; never throws. */
async function callPlugin(plugin: string, method: string): Promise<void> {
  try {
    await capacitor()?.Plugins?.[plugin]?.[method]?.();
  } catch {
    // A plugin the wrapper does not have, or a platform that rejects it: ignore.
  }
}

export const isFullscreenSupported = (): boolean =>
  typeof document !== "undefined" && document.fullscreenEnabled === true;

export const isFullscreen = (): boolean => typeof document !== "undefined" && document.fullscreenElement !== null;

/** Fullscreen for the whole page. Resolves to whether it actually took effect. */
export async function enterFullscreen(): Promise<boolean> {
  if (isNative()) {
    // Status bar plus an immersive-sticky navigation bar plugin, when the wrapper has them.
    await callPlugin("StatusBar", "hide");
    await callPlugin("NavigationBar", "hide");
    return true;
  }
  if (!isFullscreenSupported()) return false;
  if (isFullscreen()) return true;
  try {
    await document.documentElement.requestFullscreen({ navigationUI: "hide" });
    return true;
  } catch {
    return false;
  }
}

export async function exitFullscreen(): Promise<void> {
  if (isNative()) {
    await callPlugin("StatusBar", "show");
    await callPlugin("NavigationBar", "show");
    return;
  }
  if (!isFullscreen()) return;
  try {
    await document.exitFullscreen();
  } catch {
    // Already leaving, or the document is no longer active.
  }
}

/** Calls `listener` when the user enters or leaves fullscreen by any route, such as Esc. */
export function onFullscreenChange(listener: (fullscreen: boolean) => void): () => void {
  const handler = () => listener(isFullscreen());
  document.addEventListener("fullscreenchange", handler);
  return () => document.removeEventListener("fullscreenchange", handler);
}

interface WakeLockSentinelLike {
  release: () => Promise<void>;
}

interface WakeLockLike {
  request: (type: "screen") => Promise<WakeLockSentinelLike>;
}

/**
 * Keeps the screen awake and returns a function that stops doing so. The browser drops
 * its lock when the tab is hidden, so it is taken again when the tab comes back.
 */
export function keepScreenAwake(): () => void {
  let sentinel: WakeLockSentinelLike | null = null;
  let stopped = false;

  const acquire = async () => {
    if (stopped || document.visibilityState !== "visible") return;
    try {
      const wakeLock = (navigator as unknown as { wakeLock?: WakeLockLike }).wakeLock;
      const next = (await wakeLock?.request("screen")) ?? null;
      if (stopped) void next?.release().catch(() => undefined);
      else sentinel = next;
    } catch {
      // Denied (low battery, no permission): the screen may dim, nothing else breaks.
    }
  };
  const onVisibility = () => void acquire();

  void callPlugin("KeepAwake", "keepAwake");
  void acquire();
  document.addEventListener("visibilitychange", onVisibility);

  return () => {
    stopped = true;
    document.removeEventListener("visibilitychange", onVisibility);
    void sentinel?.release().catch(() => undefined);
    sentinel = null;
    void callPlugin("KeepAwake", "allowSleep");
  };
}
