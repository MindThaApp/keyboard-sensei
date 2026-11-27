import { describe, expect, it, vi } from "vitest";
import { WindowsMidiAdapter, WindowsMidiBridge, type BridgeRequest, type WebViewChannel } from "./windows.js";

/**
 * A fake Windows host on the other end of the WebView2 channel. Its native clock
 * runs `offsetMs` ahead of the page clock. Like WebView2, it delivers JSON posted
 * with PostWebMessageAsJson as parsed objects, asynchronously.
 */
function fakeHost(options: { page: { now: number }; offsetMs: number; devices?: unknown[]; available?: boolean }) {
  const listeners = new Set<(event: { data: unknown }) => void>();
  const requests: BridgeRequest[] = [];
  const deliver = (data: unknown) => queueMicrotask(() => listeners.forEach((listener) => listener({ data })));
  const channel: WebViewChannel = {
    postMessage: (message) => {
      const request = message as BridgeRequest;
      requests.push(request);
      const result = (() => {
        switch (request.method) {
          case "midi.isAvailable": return { available: options.available ?? true };
          case "midi.start":
          case "midi.list": return { devices: options.devices ?? [] };
          case "midi.stop": return {};
          case "clock.now": return { nowMs: options.page.now + options.offsetMs };
        }
      })();
      deliver({ type: "response", id: request.id, ok: true, result });
    },
    addEventListener: (_type, listener) => void listeners.add(listener),
    removeEventListener: (_type, listener) => void listeners.delete(listener),
  };
  return { channel, requests, deliver, listeners };
}

describe("WindowsMidiBridge", () => {
  it("matches responses to requests and accepts string JSON", async () => {
    const posted: BridgeRequest[] = [];
    let listener: ((event: { data: unknown }) => void) | undefined;
    const bridge = new WindowsMidiBridge({
      postMessage: (message) => void posted.push(message as BridgeRequest),
      addEventListener: (_type, l) => void (listener = l),
      removeEventListener: () => undefined,
    });
    const first = bridge.getClock();
    const second = bridge.isAvailable();
    expect(posted.map((p) => [p.type, p.method])).toEqual([["request", "clock.now"], ["request", "midi.isAvailable"]]);
    listener!({ data: JSON.stringify({ type: "response", id: posted[1]!.id, ok: true, result: { available: true } }) });
    listener!({ data: { type: "response", id: posted[0]!.id, ok: true, result: { nowMs: 42 } } });
    await expect(first).resolves.toEqual({ nowMs: 42 });
    await expect(second).resolves.toEqual({ available: true });
  });

  it("rejects host errors and timeouts, and ignores junk", async () => {
    vi.useFakeTimers();
    let listener: ((event: { data: unknown }) => void) | undefined;
    const posted: BridgeRequest[] = [];
    const bridge = new WindowsMidiBridge(
      { postMessage: (m) => void posted.push(m as BridgeRequest), addEventListener: (_t, l) => void (listener = l), removeEventListener: () => undefined },
      1000,
    );
    const failing = bridge.start();
    listener!({ data: "not json" });
    listener!({ data: { type: "something-else" } });
    listener!({ data: { type: "response", id: posted[0]!.id, ok: false, error: "Windows MIDI is unavailable" } });
    await expect(failing).rejects.toThrow("Windows MIDI is unavailable");
    const silent = bridge.listDevices();
    vi.advanceTimersByTime(1001);
    await expect(silent).rejects.toThrow("did not answer midi.list");
    vi.useRealTimers();
  });

  it("sends people to Windows Settings for Bluetooth pairing", async () => {
    const bridge = new WindowsMidiBridge({ postMessage: () => undefined, addEventListener: () => undefined, removeEventListener: () => undefined });
    await expect(bridge.scanBluetooth()).rejects.toThrow(/Windows Settings/);
  });

  it("fails pending requests on dispose", async () => {
    const bridge = new WindowsMidiBridge({ postMessage: () => undefined, addEventListener: () => undefined, removeEventListener: () => undefined });
    const pending = bridge.getClock();
    bridge.dispose();
    await expect(pending).rejects.toThrow("closed");
  });
});

describe("WindowsMidiAdapter", () => {
  it("connects, lists devices, and replays a recorded stream on the page clock", async () => {
    const page = { now: 1000 };
    const host = fakeHost({ page, offsetMs: 50_000, devices: [{ id: "usb-1", name: "Digital Piano", transport: "usb" }] });
    const adapter = new WindowsMidiAdapter(host.channel, { clock: () => page.now, samplesPerSync: 3, resyncIntervalMs: 60_000 });
    const notes: [string, number, number][] = [];
    adapter.onNoteOn((note, _velocity, timestampMs) => notes.push(["noteon", note, timestampMs]));
    adapter.onNoteOff((note, timestampMs) => notes.push(["noteoff", note, timestampMs]));

    await adapter.connect();
    expect(adapter.listDevices()).toEqual([{ id: "usb-1", name: "Digital Piano" }]);
    expect(host.requests.map((r) => r.method)).toEqual(["midi.isAvailable", "clock.now", "clock.now", "clock.now", "midi.start"]);

    // A recorded stream: note on, running-status note on, note off as velocity 0.
    page.now = 2000;
    host.deliver({ type: "event", event: "midiMessage", data: { deviceId: "usb-1", timestampMs: 51_900, messages: [[0x90, 60, 90], [0x90, 64, 80]] } });
    host.deliver({ type: "event", event: "midiMessage", data: { deviceId: "usb-1", timestampMs: 51_950, messages: [[0x90, 60, 0], [0xf8], [0x90, 200, 1]] } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(notes).toEqual([
      ["noteon", 60, 1900],
      ["noteon", 64, 1900],
      ["noteoff", 60, 1950],
    ]);
    adapter.disconnect();
    expect(host.listeners.size).toBe(1); // the bridge keeps its channel; the adapter's listeners are gone
  });

  it("rebinds on hot-plug (devicesChanged) without a reconnect", async () => {
    const page = { now: 0 };
    const host = fakeHost({ page, offsetMs: 0 });
    const adapter = new WindowsMidiAdapter(host.channel, { clock: () => page.now, samplesPerSync: 1 });
    const seen: string[][] = [];
    adapter.onStateChange((devices) => seen.push(devices.map((d) => d.name)));
    await adapter.connect();
    host.deliver({ type: "event", event: "devicesChanged", data: { devices: [{ id: "ble-1", name: "BLE Keys", transport: "bluetooth" }] } });
    host.deliver({ type: "event", event: "devicesChanged", data: { devices: [] } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(seen).toEqual([[], ["BLE Keys"], []]);
    adapter.disconnect();
  });

  it("refuses to connect when the host has no MIDI", async () => {
    const host = fakeHost({ page: { now: 0 }, offsetMs: 0, available: false });
    await expect(new WindowsMidiAdapter(host.channel).connect()).rejects.toThrow(/no MIDI/);
  });
});
