import { describe, expect, it, vi } from "vitest";
import { checkMicPermission, micSettingsHelp, openMicAppSettings, requestMicPermission, type MicPermissionDeps } from "./micPermission";

const plugin = (state: "granted" | "denied" | "prompt" | "prompt-with-rationale", after = state) => ({
  checkPermissions: vi.fn(async () => ({ microphone: state })),
  requestPermissions: vi.fn(async () => ({ microphone: after })),
  openAppSettings: vi.fn(async () => ({ opened: true })),
});
const native = (p: ReturnType<typeof plugin>): MicPermissionDeps => ({ native: true, plugin: p, hasGetUserMedia: true });
const web = (state: PermissionState | "throws"): MicPermissionDeps => ({
  native: false,
  plugin: plugin("prompt"),
  hasGetUserMedia: true,
  permissions: { query: vi.fn(async () => { if (state === "throws") throw new TypeError("unknown name"); return { state } as PermissionStatus }) },
});

describe("Android permission flow", () => {
  it("asks RECORD_AUDIO through the plugin before getUserMedia", async () => {
    const p = plugin("prompt", "granted");
    expect(await checkMicPermission(native(p))).toBe("prompt");
    expect(await requestMicPermission(native(p))).toBe("granted");
    expect(p.requestPermissions).toHaveBeenCalledWith({ permissions: ["microphone"] });
  });
  it("reports a refusal for good as denied, so the app offers settings instead", async () => {
    expect(await requestMicPermission(native(plugin("prompt-with-rationale", "denied")))).toBe("denied");
    expect(await checkMicPermission(native(plugin("denied")))).toBe("denied");
    expect(micSettingsHelp({ native: true })).toEqual({ kind: "app-settings" });
  });
  it("treats a rationale state as askable", async () => {
    expect(await checkMicPermission(native(plugin("prompt-with-rationale")))).toBe("prompt");
  });
  it("opens the app's settings page", async () => {
    const p = plugin("denied");
    expect(await openMicAppSettings(p)).toBe(true);
    expect(p.openAppSettings).toHaveBeenCalled();
  });
});

describe("browser permission flow", () => {
  it("reads the Permissions API and lets getUserMedia prompt", async () => {
    expect(await checkMicPermission(web("granted"))).toBe("granted");
    expect(await checkMicPermission(web("denied"))).toBe("denied");
    expect(await requestMicPermission(web("prompt"))).toBe("prompt");
  });
  it("falls back to prompt where the browser does not know the microphone permission", async () => {
    expect(await checkMicPermission(web("throws"))).toBe("prompt");
  });
  it("is unsupported without getUserMedia", async () => {
    expect(await checkMicPermission({ ...web("granted"), hasGetUserMedia: false })).toBe("unsupported");
  });
  it("gives browser-specific help", () => {
    expect(micSettingsHelp({ native: false }, "Mozilla/5.0 Firefox/130.0")).toMatchObject({ kind: "browser" });
  });
});
