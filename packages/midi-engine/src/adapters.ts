import type { MidiAdapter, MidiDeviceInfo } from "@keyboard-sensei/shared-types";

export type NoteOnListener = (note: number, velocity: number, timestampMs: number) => void;
export type NoteOffListener = (note: number, timestampMs: number) => void;
export type ControlChangeListener = (controller: number, value: number, timestampMs: number) => void;

/** A monotonic millisecond clock. On the web this is `() => performance.now()`. */
export type MidiClock = () => number;

/**
 * Multi-subscriber fan-out shared by every adapter. Each registration returns its
 * own unsubscribe, so a React effect can register in its body and remove in its
 * cleanup — which is exactly what StrictMode's mount/unmount/mount needs.
 */
export class MidiEventHub {
  private readonly noteOnListeners = new Set<NoteOnListener>();
  private readonly noteOffListeners = new Set<NoteOffListener>();
  private readonly controlChangeListeners = new Set<ControlChangeListener>();

  onNoteOn(listener: NoteOnListener): () => void {
    return subscribe(this.noteOnListeners, listener);
  }

  onNoteOff(listener: NoteOffListener): () => void {
    return subscribe(this.noteOffListeners, listener);
  }

  onControlChange(listener: ControlChangeListener): () => void {
    return subscribe(this.controlChangeListeners, listener);
  }

  emitNoteOn(note: number, velocity: number, timestampMs: number): void {
    for (const listener of [...this.noteOnListeners]) listener(note, velocity, timestampMs);
  }

  emitNoteOff(note: number, timestampMs: number): void {
    for (const listener of [...this.noteOffListeners]) listener(note, timestampMs);
  }

  emitControlChange(controller: number, value: number, timestampMs: number): void {
    for (const listener of [...this.controlChangeListeners]) listener(controller, value, timestampMs);
  }
}

function subscribe<T>(set: Set<T>, listener: T): () => void {
  set.add(listener);
  return () => {
    set.delete(listener);
  };
}

/**
 * The on-screen keyboard (and any synthetic input, e.g. tests). Platform-free: the
 * owner supplies the clock, so its timestamps share a basis with real hardware input.
 */
export class MockMidiAdapter extends MidiEventHub implements MidiAdapter {
  constructor(private readonly clock: MidiClock) {
    super();
  }

  async connect(): Promise<void> {}

  disconnect(): void {}

  listDevices(): MidiDeviceInfo[] {
    return [{ id: "mock", name: "Virtual Keyboard", manufacturer: "Keyboard Sensei" }];
  }

  triggerNoteOn(note: number, velocity = 100, timestampMs = this.clock()): void {
    this.emitNoteOn(note, velocity, timestampMs);
  }

  triggerNoteOff(note: number, timestampMs = this.clock()): void {
    this.emitNoteOff(note, timestampMs);
  }

  triggerControlChange(controller: number, value: number, timestampMs = this.clock()): void {
    this.emitControlChange(controller, value, timestampMs);
  }
}

/** Decodes one raw MIDI channel message into hub events. Shared by every hardware adapter. */
export function dispatchMidiMessage(hub: MidiEventHub, data: ArrayLike<number>, timestampMs: number): void {
  const status = data[0] ?? 0;
  const data1 = data[1] ?? 0;
  const data2 = data[2] ?? 0;
  const command = status & 0xf0;
  if (command === 0x90 && data2 > 0) hub.emitNoteOn(data1, data2, timestampMs);
  else if (command === 0x80 || command === 0x90) hub.emitNoteOff(data1, timestampMs);
  else if (command === 0xb0) hub.emitControlChange(data1, data2, timestampMs);
}
