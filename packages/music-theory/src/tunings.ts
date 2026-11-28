/**
 * Tuner presets (spec 5.2) and the reference-pitch range (5.3). Shared by the
 * tuner, lesson content and chord grading. Strings are listed low to high as
 * sounding MIDI notes.
 */

export type TuningInstrument = "guitar" | "violin" | "piano";

export interface TuningString {
  /** Display name with octave, e.g. "Eb2". */
  label: string;
  midi: number;
}

export interface TuningPreset {
  id: string;
  instrument: TuningInstrument;
  name: string;
  strings: TuningString[];
}

const NOTE_OFFSETS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "E2" -> 40, "Eb2" -> 39, "F#3" -> 54. Throws on anything else. */
export function parseNoteName(name: string): number {
  const match = /^([A-G])(#|b)?(-?\d)$/.exec(name.trim());
  if (!match) throw new RangeError(`Not a note name: ${name}`);
  const [, letter, accidental, octave] = match;
  return 12 * (Number(octave) + 1) + NOTE_OFFSETS[letter!]! + (accidental === "#" ? 1 : accidental === "b" ? -1 : 0);
}

function preset(id: string, instrument: TuningInstrument, name: string, notes: string): TuningPreset {
  return { id, instrument, name, strings: notes.split(" ").map(label => ({ label, midi: parseNoteName(label) })) };
}

/** Preset ids are stored in settings: never rename one. */
export const TUNING_PRESETS: readonly TuningPreset[] = [
  preset("guitar-standard", "guitar", "Standard", "E2 A2 D3 G3 B3 E4"),
  preset("guitar-drop-d", "guitar", "Drop D", "D2 A2 D3 G3 B3 E4"),
  preset("guitar-half-step-down", "guitar", "Half step down", "Eb2 Ab2 Db3 Gb3 Bb3 Eb4"),
  preset("guitar-full-step-down", "guitar", "Full step down", "D2 G2 C3 F3 A3 D4"),
  preset("guitar-drop-c", "guitar", "Drop C", "C2 G2 C3 F3 A3 D4"),
  preset("guitar-dadgad", "guitar", "DADGAD", "D2 A2 D3 G3 A3 D4"),
  preset("guitar-open-g", "guitar", "Open G", "D2 G2 D3 G3 B3 D4"),
  preset("guitar-open-d", "guitar", "Open D", "D2 A2 D3 F#3 A3 D4"),
  preset("guitar-open-e", "guitar", "Open E", "E2 B2 E3 G#3 B3 E4"),
  preset("violin-standard", "violin", "Standard", "G3 D4 A4 E5"),
];

export const DEFAULT_TUNING_PRESET_ID: Record<TuningInstrument, string | null> = {
  guitar: "guitar-standard",
  violin: "violin-standard",
  // Piano has no strings to pick from: the tuner runs chromatic over all 88 keys.
  piano: null,
};

export function tuningPresetById(id: string): TuningPreset | undefined {
  return TUNING_PRESETS.find(p => p.id === id);
}

export function tuningPresetsFor(instrument: TuningInstrument): TuningPreset[] {
  return TUNING_PRESETS.filter(p => p.instrument === instrument);
}

/** Piano range: A0 (21) to C8 (108). */
export const PIANO_RANGE = { low: 21, high: 108 } as const;

/** Reference pitch: A4 = 440 Hz by default, 415-466 Hz in 0.5 Hz steps (0.1 Hz fine). */
export const REFERENCE_PITCH = {
  defaultHz: 440,
  minHz: 415,
  maxHz: 466,
  stepHz: 0.5,
  fineStepHz: 0.1,
  quickPicksHz: [440, 442, 443, 432, 415] as const,
} as const;

export function clampReferencePitch(hz: number): number {
  if (!Number.isFinite(hz)) return REFERENCE_PITCH.defaultHz;
  const clamped = Math.min(REFERENCE_PITCH.maxHz, Math.max(REFERENCE_PITCH.minHz, hz));
  return Math.round(clamped * 10) / 10;
}

/** Capo: every string sounds `frets` semitones higher (names follow). Capo 0-12. */
export function applyCapo(strings: readonly TuningString[], frets: number): TuningString[] {
  const capo = Math.max(0, Math.min(12, Math.round(frets)));
  return strings.map(s => ({ label: midiLabel(s.midi + capo, s.label.includes("b")), midi: s.midi + capo }));
}

const SHARPS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLATS = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

export function midiLabel(midi: number, preferFlats = false): string {
  return `${(preferFlats ? FLATS : SHARPS)[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

/** A learner's own tuning: validated before it is saved or used. */
export function validateCustomTuning(name: string, labels: string[]): { ok: true; strings: TuningString[] } | { ok: false; error: string } {
  if (!name.trim()) return { ok: false, error: "Give the tuning a name." };
  if (labels.length < 1 || labels.length > 12) return { ok: false, error: "A tuning has 1 to 12 strings." };
  const strings: TuningString[] = [];
  for (const label of labels) {
    try {
      const midi = parseNoteName(label);
      if (midi < 21 || midi > 108) return { ok: false, error: `${label} is outside the tuner's range.` };
      strings.push({ label: label.trim(), midi });
    } catch {
      return { ok: false, error: `"${label}" is not a note (try E2, F#3 or Bb3).` };
    }
  }
  return { ok: true, strings };
}
