import type { MidiAdapter, MidiDeviceInfo } from "@keyboard-sensei/shared-types";

type NoteOnCallback = (note: number, velocity: number, timestampMs: number) => void;
type NoteOffCallback = (note: number, timestampMs: number) => void;

export class MockMidiAdapter implements MidiAdapter {
  private noteOn: NoteOnCallback = () => undefined;
  private noteOff: NoteOffCallback = () => undefined;
  async connect(): Promise<void> {}
  disconnect(): void {}
  listDevices(): MidiDeviceInfo[] { return [{ id: "mock", name: "Virtual Keyboard", manufacturer: "Keyboard Sensei" }] }
  onNoteOn(cb: NoteOnCallback): void { this.noteOn = cb }
  onNoteOff(cb: NoteOffCallback): void { this.noteOff = cb }
  emitNoteOn(note: number, velocity = 100, timestampMs = performance.now()): void { this.noteOn(note, velocity, timestampMs) }
  emitNoteOff(note: number, timestampMs = performance.now()): void { this.noteOff(note, timestampMs) }
  triggerNoteOn(note: number, velocity = 100, timestampMs = performance.now()): void { this.emitNoteOn(note, velocity, timestampMs) }
  triggerNoteOff(note: number, timestampMs = performance.now()): void { this.emitNoteOff(note, timestampMs) }
}

export function isWebMidiSupported(): boolean { return WebMidiAdapter.isSupported() }

export class WebMidiAdapter implements MidiAdapter {
  private access: MIDIAccess | null = null;
  private noteOn: NoteOnCallback = () => undefined;
  private noteOff: NoteOffCallback = () => undefined;
  private stateChange: (devices: MidiDeviceInfo[]) => void = () => undefined;
  static isSupported(): boolean { return typeof navigator !== "undefined" && "requestMIDIAccess" in navigator && globalThis.isSecureContext }
  async connect(): Promise<void> {
    if (!WebMidiAdapter.isSupported()) throw new Error("Web MIDI is unavailable; use MockMidiAdapter");
    this.access = await navigator.requestMIDIAccess();
    this.access.inputs.forEach(input => { input.onmidimessage = (event: MIDIMessageEvent) => this.handleMessage(event) });
    this.access.onstatechange = () => {
      this.access?.inputs.forEach(input => { input.onmidimessage = (event: MIDIMessageEvent) => this.handleMessage(event) });
      this.stateChange(this.listDevices());
    };
  }
  disconnect(): void { this.access?.inputs.forEach(input => { input.onmidimessage = null }); this.access = null }
  listDevices(): MidiDeviceInfo[] { const devices: MidiDeviceInfo[]=[]; this.access?.inputs.forEach(({id,name,manufacturer})=>devices.push({id,name:name??"MIDI input",...(manufacturer?{manufacturer}:{})})); return devices }
  onNoteOn(cb: NoteOnCallback): void { this.noteOn = cb }
  onNoteOff(cb: NoteOffCallback): void { this.noteOff = cb }
  onStateChange(cb: (devices: MidiDeviceInfo[]) => void): void { this.stateChange = cb }
  private handleMessage(event: MIDIMessageEvent): void {
    const data = event.data;
    if (!data) return;
    const status = data[0] ?? 0, note = data[1] ?? 0, velocity = data[2] ?? 0;
    const command = status & 0xf0;
    if (command === 0x90 && velocity > 0) this.noteOn(note, velocity, event.timeStamp);
    else if (command === 0x80 || command === 0x90) this.noteOff(note, event.timeStamp);
  }
}
