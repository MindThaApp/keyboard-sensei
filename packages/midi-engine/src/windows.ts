/**
 * Windows-app entry point (`@keyboard-sensei/midi-engine/windows`).
 *
 * The Windows app (apps/windows) hosts the web app in WebView2 and reads MIDI
 * natively (Windows MIDI Services / Windows.Devices.Midi), which also sees paired
 * Bluetooth LE keyboards and survives hot-plug. The host and the page talk over
 * the WebView2 message channel (`window.chrome.webview`); this file is the page
 * side of that protocol. It speaks the same NativeMidiPlugin shape as the Android
 * plugin, so the adapter is the Android adapter with a different transport.
 *
 * Protocol (JSON, version 1; mirrored by apps/windows/MusicPortal/Midi/BridgeProtocol.cs):
 *   page -> host  { type: "request", id, method, params? }
 *                   method: "midi.isAvailable" | "midi.start" | "midi.stop" | "midi.list" | "clock.now"
 *   host -> page  { type: "response", id, ok: true, result } | { type: "response", id, ok: false, error }
 *   host -> page  { type: "event", event: "midiMessage", data: NativeMidiMessageEvent }
 *   host -> page  { type: "event", event: "devicesChanged", data: NativeMidiDevicesEvent }
 */
import {
  CapacitorMidiAdapter,
  type CapacitorMidiAdapterOptions,
  type NativeMidiDevicesEvent,
  type NativeMidiMessageEvent,
  type NativeMidiPlugin,
  type NativePluginListenerHandle,
} from "./capacitor.js";

export const WINDOWS_BRIDGE_PROTOCOL_VERSION = 1;

/** The part of `window.chrome.webview` the bridge uses. */
export interface WebViewChannel {
  postMessage(message: unknown): void;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  removeEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
}

export type BridgeMethod = "midi.isAvailable" | "midi.start" | "midi.stop" | "midi.list" | "clock.now";

export interface BridgeRequest {
  type: "request";
  id: number;
  method: BridgeMethod;
  params?: Record<string, unknown>;
}

export type BridgeResponse =
  | { type: "response"; id: number; ok: true; result: unknown }
  | { type: "response"; id: number; ok: false; error: string };

export type BridgeEvent =
  | { type: "event"; event: "midiMessage"; data: NativeMidiMessageEvent }
  | { type: "event"; event: "devicesChanged"; data: NativeMidiDevicesEvent };

/** WebView2 delivers `PostWebMessageAsJson` already parsed, and string messages as strings. */
function parseIncoming(data: unknown): BridgeResponse | BridgeEvent | null {
  let value = data;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object") return null;
  const message = value as { type?: unknown };
  if (message.type === "response" || message.type === "event") return value as BridgeResponse | BridgeEvent;
  return null;
}

/**
 * A NativeMidiPlugin over the WebView2 message channel. Requests time out so a
 * host that stopped answering cannot hang the lesson player.
 */
export class WindowsMidiBridge implements NativeMidiPlugin {
  private nextId = 1;
  private readonly pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>();
  private readonly listeners = {
    midiMessage: new Set<(event: NativeMidiMessageEvent) => void>(),
    devicesChanged: new Set<(event: NativeMidiDevicesEvent) => void>(),
  };
  private readonly onMessage = (event: { data: unknown }) => this.receive(event.data);

  constructor(private readonly channel: WebViewChannel, private readonly timeoutMs = 5000) {
    channel.addEventListener("message", this.onMessage);
  }

  /** Stops listening to the channel and fails anything still waiting. */
  dispose(): void {
    this.channel.removeEventListener("message", this.onMessage);
    for (const [id, waiter] of this.pending) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error("Windows MIDI bridge closed"));
      this.pending.delete(id);
    }
  }

  request<T>(method: BridgeMethod, params?: Record<string, unknown>): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Windows MIDI bridge did not answer ${method}`));
      }, this.timeoutMs);
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer });
      const message: BridgeRequest = { type: "request", id, method, ...(params ? { params } : {}) };
      this.channel.postMessage(message);
    });
  }

  receive(data: unknown): void {
    const message = parseIncoming(data);
    if (!message) return;
    if (message.type === "response") {
      const waiter = this.pending.get(message.id);
      if (!waiter) return;
      this.pending.delete(message.id);
      clearTimeout(waiter.timer);
      if (message.ok) waiter.resolve(message.result);
      else waiter.reject(new Error(message.error || "Windows MIDI bridge error"));
      return;
    }
    if (message.event === "midiMessage") for (const listener of [...this.listeners.midiMessage]) listener(message.data);
    else if (message.event === "devicesChanged") for (const listener of [...this.listeners.devicesChanged]) listener(message.data);
  }

  isAvailable = () => this.request<{ available: boolean }>("midi.isAvailable");
  start = () => this.request<NativeMidiDevicesEvent>("midi.start");
  stop = async () => {
    await this.request<unknown>("midi.stop").catch(() => undefined);
  };
  listDevices = () => this.request<NativeMidiDevicesEvent>("midi.list");
  getClock = () => this.request<{ nowMs: number }>("clock.now");

  /** In-app BLE scanning is a later step on Windows: keyboards are paired in Windows Settings (spec 8.3). */
  scanBluetooth = async (): Promise<{ devices: never[] }> => {
    throw new Error("Pair Bluetooth MIDI keyboards in Windows Settings > Bluetooth & devices.");
  };
  connectBluetooth = async (): Promise<never> => {
    throw new Error("Pair Bluetooth MIDI keyboards in Windows Settings > Bluetooth & devices.");
  };

  addListener: NativeMidiPlugin["addListener"] = (async (
    eventName: "midiMessage" | "devicesChanged",
    listener: (event: never) => void,
  ): Promise<NativePluginListenerHandle> => {
    const set = this.listeners[eventName] as Set<(event: never) => void>;
    set.add(listener);
    return { remove: async () => void set.delete(listener) };
  }) as NativeMidiPlugin["addListener"];
}

/**
 * MIDI input in the Windows app: the native bridge, with native timestamps mapped
 * onto performance.now() by the same NativeClockSync the Android adapter uses.
 */
export class WindowsMidiAdapter extends CapacitorMidiAdapter {
  readonly bridge: WindowsMidiBridge;

  constructor(channel: WebViewChannel, options: CapacitorMidiAdapterOptions & { timeoutMs?: number } = {}) {
    const bridge = new WindowsMidiBridge(channel, options.timeoutMs);
    super(bridge, options);
    this.bridge = bridge;
  }
}
