/**
 * Reading the tune out of an ABC transcription, for the second-source check
 * of authored pieces (see ./incipit.ts for how two openings are compared).
 *
 * Only pitch matters here, so durations, chords, ornaments, lyrics and
 * repeats are skipped. The reader handles key signatures (major, minor and
 * the modes), bar-long accidentals, octave marks, ties and the first voice of
 * a multi-voice tune; it is not a general ABC parser.
 */

export interface AbcTune {
  /** The X: reference number. */
  x: string;
  title: string;
  /** Header and body lines of this tune, without the X: line. */
  lines: string[];
}

/** Split a file holding one or many tunes at its `X:` lines. */
export function splitAbcTunes(text: string): AbcTune[] {
  const tunes: AbcTune[] = [];
  let current: AbcTune | null = null;
  for (const line of text.replace(/\r/g, "").split("\n")) {
    const header = /^X:\s*(\S*)/.exec(line);
    if (header) {
      current = { x: header[1]!, title: "", lines: [] };
      tunes.push(current);
      continue;
    }
    if (!current) continue;
    const title = /^T:\s*(.*)$/.exec(line);
    if (title && !current.title) current.title = title[1]!.trim();
    current.lines.push(line);
  }
  return tunes;
}

const LETTER_PITCH: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const SHARP_ORDER = ["F", "C", "G", "D", "A", "E", "B"];
const FLAT_ORDER = ["B", "E", "A", "D", "G", "C", "F"];
const MODE_OFFSET: Record<string, number> = { maj: 0, ion: 0, mix: -1, dor: -2, phr: -4, lyd: 1, loc: -5, min: -3, aeo: -3 };

/** Accidental count of a key: positive sharps, negative flats; null when the K: line names no key. */
function keyAccidentals(spec: string): Map<string, number> {
  const match = /^\s*([A-G])([#b]?)\s*([A-Za-z]*)/.exec(spec);
  const signature = new Map<string, number>();
  if (!match) return signature;
  const [, tonic, accidental, modeText] = match;
  const modeKey = (modeText ?? "").toLowerCase().slice(0, 3);
  const mode = modeText && modeKey in MODE_OFFSET ? modeKey : modeKey === "m" || modeKey === "" ? (modeText ? "min" : "maj") : "maj";
  // Position of the major key on the circle of fifths, then shifted by the mode.
  const majorFifths: Record<string, number> = { C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, F: -1 };
  const fifths = majorFifths[tonic!]! + (accidental === "#" ? 7 : accidental === "b" ? -7 : 0) + MODE_OFFSET[mode]!;
  // Modes are relative to their tonic's major key: Gmix is G major with a flat 7th.
  for (const letter of fifths >= 0 ? SHARP_ORDER.slice(0, fifths) : FLAT_ORDER.slice(0, -fifths)) signature.set(letter, fifths >= 0 ? 1 : -1);
  return signature;
}

/** The notes of the first voice of a tune, as MIDI numbers (60 = middle C), before any transposition. */
export function abcMelody(tune: AbcTune): number[] {
  let signature = new Map<string, number>();
  let inBody = false;
  const notes: number[] = [];
  let voiceSeen: string | null = null;
  let skipVoice = false;
  let tiedFrom: number | null = null;
  let barAccidentals = new Map<string, number>();

  for (const raw of tune.lines) {
    const line = raw.replace(/%.*$/, "");
    const field = /^([A-Za-z]):\s*(.*)$/.exec(line);
    if (field && !inBody) {
      if (field[1] === "K") {
        signature = keyAccidentals(field[2]!);
        inBody = true;
      }
      continue;
    }
    if (field) {
      if (field[1] === "K") signature = keyAccidentals(field[2]!);
      if (field[1] === "V") {
        const id = field[2]!.split(/\s/)[0]!;
        voiceSeen ??= id;
        skipVoice = id !== voiceSeen;
      }
      continue;
    }
    if (!inBody || skipVoice) continue;

    const text = line.replace(/\[[A-Za-z]:[^\]]*\]/g, "").replace(/"[^"]*"/g, "").replace(/![^!]*!/g, "").replace(/\+[^+]*\+/g, "").replace(/\{[^}]*\}/g, "");
    for (let i = 0; i < text.length; i++) {
      const char = text[i]!;
      if (char === "|" || char === ":") {
        if (char === "|") barAccidentals = new Map();
        continue;
      }
      if (char === "[" && /[0-9]/.test(text[i + 1] ?? "")) continue; // a volta bracket
      if (char === "-") {
        tiedFrom = notes.length > 0 ? notes[notes.length - 1]! : null;
        continue;
      }
      const accidentalMatch = /^(\^\^|__|\^|_|=)?([A-Ga-g])([,']*)/.exec(text.slice(i));
      if (!accidentalMatch) continue;
      const [whole, accidental, letter, marks] = accidentalMatch;
      i += whole.length - 1;
      const upper = letter!.toUpperCase();
      let shift: number;
      if (accidental) {
        shift = accidental === "^" ? 1 : accidental === "^^" ? 2 : accidental === "_" ? -1 : accidental === "__" ? -2 : 0;
        barAccidentals.set(upper, shift);
      } else {
        shift = barAccidentals.get(upper) ?? signature.get(upper) ?? 0;
      }
      let octave = letter === letter!.toLowerCase() ? 5 : 4;
      for (const mark of marks ?? "") octave += mark === "'" ? 1 : -1;
      const midi = 12 * (octave + 1) + LETTER_PITCH[upper]! + shift;
      if (tiedFrom === midi) {
        tiedFrom = null; // the second half of a tie sounds as one note
        continue;
      }
      tiedFrom = null;
      notes.push(midi);
    }
  }
  return notes;
}

/** Find a tune in a (possibly multi-tune) ABC file by its X: number. */
export function findAbcTune(text: string, x: string): AbcTune | null {
  return splitAbcTunes(text).find((tune) => tune.x === x) ?? null;
}
