/**
 * Native-app entry point (`@keyboard-sensei/midi-engine/capacitor`).
 *
 * Android's WebView has no Web MIDI, so the Android app reads hardware through a
 * native plugin (android.media.midi) and forwards framed channel messages here.
 * This file deliberately does not import @capacitor/core: the app registers the
 * plugin and hands it in, which keeps the package platform-free and testable.
 */
import type { MidiAdapter, MidiDeviceInfo } from "@keyboard-sensei/shared-types";
import { MidiEventHub, dispatchMidiMessage, type MidiClock } from "./adapters.js";

export type NativeMidiTransport = "usb" | "bluetooth" | "other";

export interface NativeMidiDevice {
  id: string;
  name: string;
  manufacturer?: string;
  transport: NativeMidiTransport;
}

/**
 * One batch of complete channel messages from one device. `timestampMs` is on the
 * native monotonic clock (Android System.nanoTime() in milliseconds), not the
 * page's clock: the adapter converts it.
 */
export interface NativeMidiMessageEvent {
  deviceId: string;
  timestampMs: number;
  messages: number[][];
}

export interface NativeMidiDevicesEvent {
  devices: NativeMidiDevice[];
}

export interface NativeBluetoothMidiDevice {
  address: string;
  name: string;
}

export interface NativePluginListenerHandle {
  remove(): Promise<void>;
}

/** The JS face of the Android `NativeMidi` plugin (MainActivity registers it). */
export interface NativeMidiPlugin {
  isAvailable(): Promise<{ available: boolean }>;
  /** Opens every attached USB/Bluetooth MIDI input and keeps opening new ones. */
  start(): Promise<NativeMidiDevicesEvent>;
  stop(): Promise<void>;
  listDevices(): Promise<NativeMidiDevicesEvent>;
  /** The native monotonic clock, in milliseconds. */
  getClock(): Promise<{ nowMs: number }>;
  /** Asks for Bluetooth permissions if needed, then scans for BLE MIDI keyboards. */
  scanBluetooth(options: { timeoutMs: number }): Promise<{ devices: NativeBluetoothMidiDevice[] }>;
  connectBluetooth(options: { address: string }): Promise<{ device: NativeMidiDevice }>;
  addListener(eventName: "midiMessage", listener: (event: NativeMidiMessageEvent) => void): Promise<NativePluginListenerHandle>;
  addListener(eventName: "devicesChanged", listener: (event: NativeMidiDevicesEvent) => void): Promise<NativePluginListenerHandle>;
}

/**
 * Maps the native monotonic clock onto the page clock (performance.now()).
 *
 * Each sample brackets one getClock() round trip with two page-clock readings;
 * the native reading happened somewhere inside that bracket, so the midpoint is
 * the estimate and half the round trip is its worst-case error. The sample with
 * the smallest round trip wins. Both clocks are monotonic and tick at the same
 * rate, so the offset is a constant and old samples stay valid; they are kept in
 * a short window only to tolerate the device suspending.
 */
export class NativeClockSync {
  static readonly MAX_SAMPLES = 16;
  private samples: { roundTripMs: number; offsetMs: number }[] = [];

  sample(nativeMs: number, pageBeforeMs: number, pageAfterMs: number): void {
    const roundTripMs = pageAfterMs - pageBeforeMs;
    if (!Number.isFinite(nativeMs) || !(roundTripMs >= 0)) return;
    this.samples.push({ roundTripMs, offsetMs: nativeMs - (pageBeforeMs + pageAfterMs) / 2 });
    if (this.samples.length > NativeClockSync.MAX_SAMPLES) this.samples.shift();
  }

  get synced(): boolean {
    return this.samples.length > 0;
  }

  /** Worst-case error of the current estimate, in ms (half the best round trip). */
  get uncertaintyMs(): number {
    return this.best() ? this.best()!.roundTripMs / 2 : Number.POSITIVE_INFINITY;
  }

  toPageMs(nativeMs: number): number | null {
    const best = this.best();
    return best ? nativeMs - best.offsetMs : null;
  }

  reset(): void {
    this.samples = [];
  }

  private best(): { roundTripMs: number; offsetMs: number } | undefined {
    let best: { roundTripMs: number; offsetMs: number } | undefined;
    for (const sample of this.samples) if (!best || sample.roundTripMs < best.roundTripMs) best = sample;
    return best;
  }
}

/** True for a complete channel voice message (status 0x80-0xEF plus its data bytes). */
export function isChannelMessage(message: unknown): message is number[] {
  if (!Array.isArray(message) || message.length < 2 || message.length > 3) return false;
  if (!message.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 0xff)) return false;
  const status = message[0] as number;
  if (status < 0x80 || status >= 0xf0) return false;
  const expectedLength = (status & 0xf0) === 0xc0 || (status & 0xf0) === 0xd0 ? 2 : 3;
  return message.length === expectedLength && message.slice(1).every((byte) => byte < 0x80);
}

export interface CapacitorMidiAdapterOptions {
  /** The page clock every other adapter uses. Defaults to performance.now(). */
  clock?: MidiClock;
  /** How often to refresh the clock mapping. */
  resyncIntervalMs?: number;
  /** getClock() round trips taken per refresh. */
  samplesPerSync?: number;
}

export class CapacitorMidiAdapter extends MidiEventHub implements MidiAdapter {
  private readonly clock: MidiClock;
  private readonly resyncIntervalMs: number;
  private readonly samplesPerSync: number;
  private readonly clockSync = new NativeClockSync();
  private readonly stateListeners = new Set<(devices: MidiDeviceInfo[]) => void>();
  private devices: NativeMidiDevice[] = [];
  private handles: NativePluginListenerHandle[] = [];
  private resyncTimer: ReturnType<typeof setInterval> | null = null;
  private connected = false;

  constructor(private readonly plugin: NativeMidiPlugin, options: CapacitorMidiAdapterOptions = {}) {
    super();
    this.clock = options.clock ?? (() => performance.now());
    this.resyncIntervalMs = options.resyncIntervalMs ?? 30_000;
    this.samplesPerSync = options.samplesPerSync ?? 5;
  }

  async connect(): Promise<void> {
    if (this.connected) return;
    const { available } = await this.plugin.isAvailable();
    if (!available) throw new Error("This device has no MIDI support.");
    this.handles.push(
      await this.plugin.addListener("midiMessage", (event) => this.handleMessage(event)),
      await this.plugin.addListener("devicesChanged", ({ devices }) => {
        this.setDevices(devices);
        // A reconnect is a good moment to refresh the mapping (the device may have
        // slept); it costs a few bridge round trips.
        void this.syncClock();
      }),
    );
    this.connected = true;
    await this.syncClock();
    const { devices } = await this.plugin.start();
    this.setDevices(devices);
    this.resyncTimer = setInterval(() => void this.syncClock(), this.resyncIntervalMs);
  }

  disconnect(): void {
    this.connected = false;
    if (this.resyncTimer !== null) clearInterval(this.resyncTimer);
    this.resyncTimer = null;
    for (const handle of this.handles) void handle.remove();
    this.handles = [];
    void this.plugin.stop();
    this.devices = [];
  }

  listDevices(): MidiDeviceInfo[] {
    return this.devices.map(({ id, name, manufacturer }) => ({ id, name, ...(manufacturer ? { manufacturer } : {}) }));
  }

  onStateChange(listener: (devices: MidiDeviceInfo[]) => void): () => void {
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  /** Scans for Bluetooth LE MIDI keyboards (prompting for permission if needed). */
  scanBluetooth(timeoutMs = 8000): Promise<NativeBluetoothMidiDevice[]> {
    return this.plugin.scanBluetooth({ timeoutMs }).then(({ devices }) => devices);
  }

  async connectBluetooth(address: string): Promise<void> {
    await this.plugin.connectBluetooth({ address });
  }

  async syncClock(): Promise<void> {
    for (let i = 0; i < this.samplesPerSync; i += 1) {
      const before = this.clock();
      const { nowMs } = await this.plugin.getClock();
      const after = this.clock();
      this.clockSync.sample(nowMs, before, after);
    }
  }

  /** Native event time on the page clock; never later than the moment it arrived. */
  toPageTime(nativeMs: number): number {
    const received = this.clock();
    const mapped = this.clockSync.toPageMs(nativeMs);
    if (mapped === null || !Number.isFinite(mapped)) return received;
    return Math.min(mapped, received);
  }

  handleMessage(event: NativeMidiMessageEvent): void {
    if (!event || !Array.isArray(event.messages)) return;
    const timestampMs = this.toPageTime(Number(event.timestampMs));
    for (const message of event.messages) {
      if (isChannelMessage(message)) dispatchMidiMessage(this, message, timestampMs);
    }
  }

  private setDevices(devices: NativeMidiDevice[]): void {
    this.devices = Array.isArray(devices) ? devices : [];
    const info = this.listDevices();
    for (const listener of [...this.stateListeners]) listener(info);
  }
}
