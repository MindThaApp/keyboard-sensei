import { describe, expect, it, vi } from "vitest";
import {
  CapacitorMidiAdapter,
  NativeClockSync,
  isChannelMessage,
  type NativeMidiDevice,
  type NativeMidiDevicesEvent,
  type NativeMidiMessageEvent,
  type NativeMidiPlugin,
} from "./capacitor.js";

/**
 * A fake plugin whose native clock runs `offsetMs` ahead of the page clock, with
 * a bridge that takes `bridgeMs` each way.
 */
function fakePlugin(options: { offsetMs: number; bridgeMs?: number; page: { now: number }; devices?: NativeMidiDevice[] }) {
  const listeners: { midiMessage?: (event: NativeMidiMessageEvent) => void; devicesChanged?: (event: NativeMidiDevicesEvent) => void } = {};
  const bridgeMs = options.bridgeMs ?? 0;
  const removed: string[] = [];
  const plugin: NativeMidiPlugin = {
    isAvailable: async () => ({ available: true }),
    start: async () => ({ devices: options.devices ?? [] }),
    stop: vi.fn(async () => {}),
    listDevices: async () => ({ devices: options.devices ?? [] }),
    getClock: async () => {
      options.page.now += bridgeMs;
      const nowMs = options.page.now + options.offsetMs;
      options.page.now += bridgeMs;
      return { nowMs };
    },
    scanBluetooth: async () => ({ devices: [] }),
    connectBluetooth: async () => ({ device: { id: "b", name: "BLE", transport: "bluetooth" } }),
    addListener: (async (eventName: "midiMessage" | "devicesChanged", listener: never) => {
      listeners[eventName] = listener;
      return { remove: async () => void removed.push(eventName) };
    }) as NativeMidiPlugin["addListener"],
  };
  return { plugin, listeners, removed };
}

describe("isChannelMessage", () => {
  it("accepts complete note, CC and two-byte messages on any channel", () => {
    expect(isChannelMessage([0x90, 60, 100])).toBe(true);
    expect(isChannelMessage([0x8f, 60, 0])).toBe(true);
    expect(isChannelMessage([0xb3, 64, 127])).toBe(true);
    expect(isChannelMessage([0xc0, 5])).toBe(true);
    expect(isChannelMessage([0xd0, 40])).toBe(true);
  });

  it("rejects running-status fragments, system messages, wrong lengths and junk", () => {
    expect(isChannelMessage([60, 100])).toBe(false); // data bytes without a status
    expect(isChannelMessage([0xf8])).toBe(false); // clock
    expect(isChannelMessage([0xf0, 1, 2])).toBe(false); // sysex
    expect(isChannelMessage([0x90, 60])).toBe(false); // truncated note-on
    expect(isChannelMessage([0xc0, 5, 6])).toBe(false); // program change is two bytes
    expect(isChannelMessage([0x90, 200, 100])).toBe(false); // data byte with the high bit set
    expect(isChannelMessage([0x90, 60.5, 100])).toBe(false);
    expect(isChannelMessage("90 3c 64")).toBe(false);
  });
});

describe("NativeClockSync", () => {
  it("uses the midpoint of the tightest round trip", () => {
    const sync = new NativeClockSync();
    // Native clock is 1000ms ahead. A slow, lopsided sample first...
    sync.sample(1000 + 10 + 2, 10, 30); // native read 2ms after the start of a 20ms trip
    // ...then a tight one.
    sync.sample(1000 + 50.5, 50, 51);
    expect(sync.toPageMs(1000 + 200)).toBeCloseTo(200, 6);
    expect(sync.uncertaintyMs).toBe(0.5);
  });

  it("returns null until it has a sample, and ignores nonsense samples", () => {
    const sync = new NativeClockSync();
    expect(sync.toPageMs(5)).toBeNull();
    sync.sample(Number.NaN, 0, 1);
    sync.sample(5, 10, 9); // negative round trip
    expect(sync.synced).toBe(false);
  });
});

describe("CapacitorMidiAdapter", () => {
  it("converts native timestamps onto the page clock", async () => {
    const page = { now: 5000 };
    const { plugin, listeners } = fakePlugin({ offsetMs: 123_456_789, bridgeMs: 1, page });
    const adapter = new CapacitorMidiAdapter(plugin, { clock: () => page.now, samplesPerSync: 3 });
    await adapter.connect();

    const seen: [number, number, number][] = [];
    adapter.onNoteOn((note, velocity, t) => seen.push([note, velocity, t]));

    // The key was struck at page time 6000 and the event reached JS 7ms later.
    page.now = 6007;
    listeners.midiMessage!({ deviceId: "1", timestampMs: 6000 + 123_456_789, messages: [[0x90, 60, 90]] });

    expect(seen).toEqual([[60, 90, 6000]]);
    adapter.disconnect();
  });

  it("never stamps an event later than the moment it arrived", async () => {
    const page = { now: 100 };
    const { plugin, listeners } = fakePlugin({ offsetMs: 50, page });
    const adapter = new CapacitorMidiAdapter(plugin, { clock: () => page.now });
    await adapter.connect();
    const stamps: number[] = [];
    adapter.onNoteOff((_note, t) => stamps.push(t));

    page.now = 200;
    listeners.midiMessage!({ deviceId: "1", timestampMs: 9_999_999, messages: [[0x80, 60, 0]] });
    expect(stamps).toEqual([200]);
    adapter.disconnect();
  });

  it("routes note on, note off (incl. velocity-0 note-on) and sustain CC64 to every subscriber", async () => {
    const page = { now: 0 };
    const { plugin, listeners } = fakePlugin({ offsetMs: 0, page });
    const adapter = new CapacitorMidiAdapter(plugin, { clock: () => page.now });
    await adapter.connect();

    const a: string[] = [];
    const b: string[] = [];
    for (const log of [a, b]) {
      adapter.onNoteOn((note, velocity) => log.push(`on ${note} ${velocity}`));
      adapter.onNoteOff((note) => log.push(`off ${note}`));
      adapter.onControlChange((cc, value) => log.push(`cc ${cc} ${value}`));
    }

    page.now = 10;
    listeners.midiMessage!({
      deviceId: "1",
      timestampMs: 10,
      messages: [
        [0x91, 64, 70], // channel 2 still counts
        [0xb0, 64, 127], // sustain down
        [0x90, 64, 0], // running-status-style note off
        [0x80, 60, 64],
        [0xb0, 64, 0], // sustain up
        [0xe0, 0, 64], // pitch bend: ignored
        [0xf8], // clock: dropped
        [60, 100], // stray data bytes: dropped
      ],
    });

    const expected = ["on 64 70", "cc 64 127", "off 64", "off 60", "cc 64 0"];
    expect(a).toEqual(expected);
    expect(b).toEqual(expected);
    adapter.disconnect();
  });

  it("reports devices on connect and on hot-plug, and cleans up on disconnect", async () => {
    const page = { now: 0 };
    const keyboard: NativeMidiDevice = { id: "7", name: "Digital Piano", manufacturer: "Roland", transport: "usb" };
    const { plugin, listeners, removed } = fakePlugin({ offsetMs: 0, page, devices: [keyboard] });
    const adapter = new CapacitorMidiAdapter(plugin, { clock: () => page.now });
    const states: string[][] = [];
    adapter.onStateChange((devices) => states.push(devices.map((d) => d.name)));

    await adapter.connect();
    expect(adapter.listDevices()).toEqual([{ id: "7", name: "Digital Piano", manufacturer: "Roland" }]);

    listeners.devicesChanged!({ devices: [] });
    expect(adapter.listDevices()).toEqual([]);
    expect(states).toEqual([["Digital Piano"], []]);

    adapter.disconnect();
    expect(plugin.stop).toHaveBeenCalled();
    await Promise.resolve();
    expect(removed.sort()).toEqual(["devicesChanged", "midiMessage"]);
  });

  it("refuses to connect when the device has no MIDI support", async () => {
    const page = { now: 0 };
    const { plugin } = fakePlugin({ offsetMs: 0, page });
    plugin.isAvailable = async () => ({ available: false });
    await expect(new CapacitorMidiAdapter(plugin).connect()).rejects.toThrow(/no MIDI/);
  });
});
