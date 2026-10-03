/**
 * Browser-only entry point (`@keyboard-sensei/midi-engine/web`). Everything that
 * touches navigator.requestMIDIAccess lives here, so the package's main entry stays
 * free of DOM types and can be shared with non-browser apps.
 */
import type { MidiAdapter, MidiDeviceInfo } from "@keyboard-sensei/shared-types";
import { MidiEventHub, dispatchMidiMessage } from "./adapters.js";

export function isWebMidiSupported(): boolean {
  return WebMidiAdapter.isSupported();
}

export class WebMidiAdapter extends MidiEventHub implements MidiAdapter {
  private access: MIDIAccess | null = null;
  private readonly stateListeners = new Set<(devices: MidiDeviceInfo[]) => void>();

  static isSupported(): boolean {
    return typeof navigator !== "undefined" && "requestMIDIAccess" in navigator && globalThis.isSecureContext;
  }

  async connect(): Promise<void> {
    if (!WebMidiAdapter.isSupported()) throw new Error("Web MIDI is unavailable; use MockMidiAdapter");
    this.access = await navigator.requestMIDIAccess();
    this.bindInputs();
    this.access.onstatechange = () => {
      // A replugged device is a brand-new MIDIInput object: re-bind, or it reports
      // as connected and sends nothing.
      this.bindInputs();
      const devices = this.listDevices();
      for (const listener of [...this.stateListeners]) listener(devices);
    };
  }

  disconnect(): void {
    this.access?.inputs.forEach((input) => {
      input.onmidimessage = null;
    });
    this.access = null;
  }

  listDevices(): MidiDeviceInfo[] {
    const devices: MidiDeviceInfo[] = [];
    this.access?.inputs.forEach(({ id, name, manufacturer }) => {
      devices.push({ id, name: name ?? "MIDI input", ...(manufacturer ? { manufacturer } : {}) });
    });
    return devices;
  }

  onStateChange(listener: (devices: MidiDeviceInfo[]) => void): () => void {
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  private bindInputs(): void {
    this.access?.inputs.forEach((input) => {
      input.onmidimessage = (event: MIDIMessageEvent) => {
        if (event.data) dispatchMidiMessage(this, event.data, event.timeStamp);
      };
    });
  }
}
