const PITCH_NAMES = ["C", "C#/Db", "D", "D#/Eb", "E", "F", "F#/Gb", "G", "G#/Ab", "A", "A#/Bb", "B"] as const;

function assertMidiNote(note: number): void {
  if (!Number.isInteger(note) || note < 0 || note > 127) throw new RangeError("MIDI note must be an integer from 0 to 127");
}

export function getPitchClass(note: number): number { assertMidiNote(note); return note % 12 }
export function getOctave(note: number): number { assertMidiNote(note); return Math.floor(note / 12) - 1 }
export function isBlackKey(note: number): boolean { return [1, 3, 6, 8, 10].includes(getPitchClass(note)) }
export function midiNoteToName(note: number): string {
  const pitch = PITCH_NAMES[getPitchClass(note)];
  const octave = getOctave(note);
  return pitch.includes("/") ? pitch.split("/").map(name => `${name}${octave}`).join("/") : `${pitch}${octave}`;
}
