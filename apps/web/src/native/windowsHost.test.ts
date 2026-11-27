// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { WindowsMidiAdapter } from "@keyboard-sensei/midi-engine/windows";
import { WebMidiAdapter } from "@keyboard-sensei/midi-engine/web";
import { createHardwareMidiAdapter, supportsBluetoothMidiScan } from "./hardwareMidi";
import { hostPlatform } from "./platform";
import { isWindowsApp, openWindowsSettings, windowsHostInfo, windowsMidiChannel } from "./windowsHost";

type W = Window & { __musicPortalHost?: unknown; chrome?: unknown };
const channel = () => ({ postMessage: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() });

afterEach(() => {
  delete (window as W).__musicPortalHost;
  delete (window as W).chrome;
});

describe("Windows host detection", () => {
  it("is a browser without the host marker", () => {
    expect(isWindowsApp()).toBe(false);
    expect(hostPlatform()).toBe("web");
    expect(windowsMidiChannel()).toBeNull();
    expect(openWindowsSettings("privacy-microphone")).toBe(false);
    expect(createHardwareMidiAdapter()).toBeInstanceOf(WebMidiAdapter);
  });

  it("uses the native bridge when the host announces it", () => {
    (window as W).__musicPortalHost = { platform: "windows", version: "1.0.0.0", midiBridge: true, protocol: 1 };
    (window as W).chrome = { webview: channel() };
    expect(windowsHostInfo()).toEqual({ platform: "windows", version: "1.0.0.0", midiBridge: true, protocol: 1 });
    expect(hostPlatform()).toBe("windows");
    const adapter = createHardwareMidiAdapter();
    expect(adapter).toBeInstanceOf(WindowsMidiAdapter);
    expect(supportsBluetoothMidiScan(adapter)).toBe(false);
  });

  it("falls back to Web MIDI in WebView2 when the bridge is off", () => {
    (window as W).__musicPortalHost = { platform: "windows", version: "1.0.0.0", midiBridge: false };
    (window as W).chrome = { webview: channel() };
    expect(isWindowsApp()).toBe(true);
    expect(createHardwareMidiAdapter()).toBeInstanceOf(WebMidiAdapter);
  });

  it("asks the host for a fixed settings page", () => {
    const webview = channel();
    (window as W).__musicPortalHost = { platform: "windows", midiBridge: false };
    (window as W).chrome = { webview };
    expect(openWindowsSettings("privacy-microphone")).toBe(true);
    expect(webview.postMessage).toHaveBeenCalledWith({ type: "openSettings", page: "privacy-microphone" });
  });
});
