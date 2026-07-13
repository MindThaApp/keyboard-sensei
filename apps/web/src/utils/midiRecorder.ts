// @tonejs/midi ships CJS; a named ESM import breaks under real node.
import ToneMidi from "@tonejs/midi";

const { Midi } = ToneMidi;

export interface RecorderNoteEvent {
  type: "noteon" | "noteoff";
  note: number;
  velocity: number;
  timestampMs: number;
}

export interface RecorderControlChangeEvent {
  type: "controlchange";
  controller: number;
  value: number;
  timestampMs: number;
}

export type RecorderEvent = RecorderNoteEvent | RecorderControlChangeEvent;

export interface MidiRecordingResult {
  bytes: Uint8Array;
  noteCount: number;
  durationSec: number;
}

interface ActiveNote {
  midi: number;
  startS: number;
  velocity: number;
}

interface RecordedNote extends ActiveNote {
  durationS: number;
}

interface RecordedControlChange {
  number: number;
  value: number;
  timeS: number;
}

const DEFAULT_BPM = 120;
const MIN_NOTE_DURATION_S = 0.001;

export class MidiRecorder {
  private recording = false;
  private firstEventMs: number | null = null;
  private activeNotes = new Map<number, ActiveNote>();
  private notes: RecordedNote[] = [];
  private controlChanges: RecordedControlChange[] = [];
  private lastEventTimeS = 0;

  start(): void {
    this.recording = true;
    this.firstEventMs = null;
    this.activeNotes.clear();
    this.notes = [];
    this.controlChanges = [];
    this.lastEventTimeS = 0;
  }

  record(event: RecorderEvent): void {
    if (!this.recording) return;
    const timeS = this.relativeTimeS(event.timestampMs);
    this.lastEventTimeS = Math.max(this.lastEventTimeS, timeS);

    if (event.type === "controlchange") {
      if (event.controller === 64) {
        this.controlChanges.push({ number: 64, value: clamp(event.value / 127, 0, 1), timeS });
      }
      return;
    }

    if (event.type === "noteon" && event.velocity > 0) {
      this.closeActive(event.note, timeS);
      this.activeNotes.set(event.note, { midi: event.note, startS: timeS, velocity: clamp(event.velocity / 127, 0, 1) });
      return;
    }

    this.closeActive(event.note, timeS);
  }

  stop(timestampMs: number): MidiRecordingResult | null {
    if (!this.recording) return null;
    this.recording = false;
    const stopTimeS = this.firstEventMs === null ? 0 : Math.max(0, (timestampMs - this.firstEventMs) / 1000);
    this.lastEventTimeS = Math.max(this.lastEventTimeS, stopTimeS);
    for (const note of this.activeNotes.values()) this.addNote(note, stopTimeS);
    this.activeNotes.clear();
    if (this.notes.length === 0) return null;

    const midi = new Midi();
    midi.header.setTempo(DEFAULT_BPM);
    midi.header.timeSignatures = [{ ticks: 0, timeSignature: [4, 4], measures: 0 } as never];
    const track = midi.addTrack();
    track.name = "Recorded piano";
    for (const note of this.notes) {
      track.addNote({ midi: note.midi, time: note.startS, duration: note.durationS, velocity: note.velocity });
    }
    for (const cc of this.controlChanges) {
      track.addCC({ number: cc.number, value: cc.value, time: cc.timeS });
    }
    return {
      bytes: new Uint8Array(midi.toArray()),
      noteCount: this.notes.length,
      durationSec: Math.max(this.lastEventTimeS, ...this.notes.map((note) => note.startS + note.durationS)),
    };
  }

  snapshot(): { elapsedSec: number; noteCount: number } {
    return { elapsedSec: this.lastEventTimeS, noteCount: this.notes.length + this.activeNotes.size };
  }

  elapsedSecAt(timestampMs: number): number {
    if (this.firstEventMs === null) return 0;
    return Math.max(this.lastEventTimeS, (timestampMs - this.firstEventMs) / 1000);
  }

  private relativeTimeS(timestampMs: number): number {
    if (this.firstEventMs === null) this.firstEventMs = timestampMs;
    return Math.max(0, (timestampMs - this.firstEventMs) / 1000);
  }

  private closeActive(midi: number, timeS: number): void {
    const active = this.activeNotes.get(midi);
    if (!active) return;
    this.activeNotes.delete(midi);
    this.addNote(active, timeS);
  }

  private addNote(note: ActiveNote, endS: number): void {
    this.notes.push({ ...note, durationS: Math.max(MIN_NOTE_DURATION_S, endS - note.startS) });
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
