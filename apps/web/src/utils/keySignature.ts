/**
 * Key signatures and pitch spelling for notation generated from MIDI.
 *
 * MIDI only knows note numbers: 61 is C♯ and D♭ at once. Which one a reader
 * expects depends on the key — in D♭ major it is D♭, in A major it is C♯ —
 * so every note is spelled relative to a key, and that key either comes from
 * the file's key-signature meta event or is estimated from the notes.
 */

export type KeyMode = "major" | "minor";

export interface KeyInfo {
  /** Position on the circle of fifths: +n = n sharps, -n = n flats (-7..7). */
  fifths: number;
  mode: KeyMode;
}

const MAJOR_NAMES: Record<number, string> = {
  [-7]: "Cb", [-6]: "Gb", [-5]: "Db", [-4]: "Ab", [-3]: "Eb", [-2]: "Bb", [-1]: "F",
  0: "C", 1: "G", 2: "D", 3: "A", 4: "E", 5: "B", 6: "F#", 7: "C#",
};
const MINOR_NAMES: Record<number, string> = {
  [-7]: "Abm", [-6]: "Ebm", [-5]: "Bbm", [-4]: "Fm", [-3]: "Cm", [-2]: "Gm", [-1]: "Dm",
  0: "Am", 1: "Em", 2: "Bm", 3: "F#m", 4: "C#m", 5: "G#m", 6: "D#m", 7: "A#m",
};

/** VexFlow key-signature spec for a key, e.g. { fifths: -5, mode: "major" } → "Db". */
export function keySpecFor(key: KeyInfo): string {
  return (key.mode === "major" ? MAJOR_NAMES : MINOR_NAMES)[key.fifths] ?? "C";
}

/** The inverse of keySpecFor; null for anything VexFlow wouldn't accept either. */
export function keyFromSpec(spec: string | undefined): KeyInfo | null {
  if (!spec) return null;
  for (const [table, mode] of [[MAJOR_NAMES, "major"], [MINOR_NAMES, "minor"]] as const) {
    for (const [fifths, name] of Object.entries(table)) {
      if (name === spec) return { fifths: Number(fifths), mode };
    }
  }
  return null;
}

/**
 * @tonejs/midi reports a key-signature event as the MAJOR key name for its
 * sharp/flat count plus a scale — so B♭ minor arrives as { key: "Db",
 * scale: "minor" }. The name therefore encodes the fifths directly. A few
 * library files carry out-of-range values, which arrive as `key: undefined`.
 */
const TONEJS_KEY_NAMES = ["Cb", "Gb", "Db", "Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E", "B", "F#", "C#"];

export function keyFromToneJs(key: string | undefined, scale: string | undefined): KeyInfo | null {
  const index = key ? TONEJS_KEY_NAMES.indexOf(key) : -1;
  if (index < 0) return null;
  return { fifths: index - 7, mode: scale === "minor" ? "minor" : "major" };
}

const LETTERS = ["c", "d", "e", "f", "g", "a", "b"];
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];
const SHARP_ORDER = ["f", "c", "g", "d", "a", "e", "b"];
const FLAT_ORDER = ["b", "e", "a", "d", "g", "c", "f"];

/** Semitone alteration the key signature applies to each letter (e.g. D major → f: +1, c: +1). */
export function keySignatureAlterations(fifths: number): Record<string, number> {
  const alterations: Record<string, number> = { c: 0, d: 0, e: 0, f: 0, g: 0, a: 0, b: 0 };
  const order = fifths > 0 ? SHARP_ORDER : FLAT_ORDER;
  for (let i = 0; i < Math.min(Math.abs(fifths), 7); i++) alterations[order[i]] = fifths > 0 ? 1 : -1;
  return alterations;
}

/** Letter index (0 = c) of the major tonic for a fifths count: each fifth up is four letters up. */
function majorTonicLetterIndex(fifths: number): number {
  return (((fifths * 4) % 7) + 7) % 7;
}

/**
 * Chromatic notes (those outside the key): which scale degree's letter to
 * write them on (0 = tonic), keyed by semitones above the tonic. Sharp-side keys raise (D♯ in D major
 * is ♯1), flat-side keys lower (G♭ in F major is ♭2), and two are fixed by
 * convention whatever the key: ♯4 (the leading tone to the dominant — G♮ in
 * D♭ major) and ♭7. Minor keys spell their raised 6th and 7th as raised —
 * G♯ in A minor, never A♭ — because that is how the harmonic and melodic
 * minor scales are written.
 */
const MAJOR_CHROMATIC_SHARP_SIDE: Record<number, number> = {
  1: 0, 3: 1, 6: 3, 8: 4, 10: 6,
};
const MAJOR_CHROMATIC_FLAT_SIDE: Record<number, number> = {
  1: 1, 3: 2, 6: 3, 8: 5, 10: 6,
};
const MAJOR_CHROMATIC_C: Record<number, number> = {
  1: 0, 3: 2, 6: 3, 8: 4, 10: 6,
};
const MINOR_CHROMATIC: Record<number, number> = {
  1: 1, 4: 2, 6: 3, 9: 5, 11: 6,
};
const MAJOR_DEGREE_SEMITONES = [0, 2, 4, 5, 7, 9, 11];
const MINOR_DEGREE_SEMITONES = [0, 2, 3, 5, 7, 8, 10];

const ACCIDENTAL_TEXT: Record<number, string> = { [-2]: "bb", [-1]: "b", 0: "", 1: "#", 2: "##" };

/**
 * Alteration needed so a letter sounds `midi`'s pitch class, normalised into
 * -2..+2 (the letter's natural pitch can be either side of the octave
 * boundary from the target — C♭ vs B, B♯ vs C).
 */
function alterationFor(midi: number, letterIndex: number): number {
  const alteration = (((midi - LETTER_PC[letterIndex]) % 12) + 12) % 12;
  return alteration > 6 ? alteration - 12 : alteration;
}

/**
 * Spells a MIDI note as a VexFlow key ("db/4", "c#/5", "cb/4") in the given
 * key. Diatonic notes take the key signature's spelling; chromatic notes
 * follow MAJOR_/MINOR_CHROMATIC above. The octave follows the LETTER, so
 * C♭4 is MIDI 59 and B♯3 is MIDI 60, as in printed music.
 */
export function spellMidi(midi: number, key: KeyInfo): string {
  const majorTonic = majorTonicLetterIndex(key.fifths);
  const tonicLetter = key.mode === "major" ? majorTonic : (majorTonic + 5) % 7;
  const alterations = keySignatureAlterations(key.fifths);
  const tonicPc = (LETTER_PC[tonicLetter] + alterations[LETTERS[tonicLetter]] + 12) % 12;
  const relative = (((midi - tonicPc) % 12) + 12) % 12;

  const degreeSemitones = key.mode === "major" ? MAJOR_DEGREE_SEMITONES : MINOR_DEGREE_SEMITONES;
  let degree = degreeSemitones.indexOf(relative);
  const chromatic = degree < 0;
  if (chromatic) {
    const table =
      key.mode === "minor"
        ? MINOR_CHROMATIC
        : key.fifths > 0
          ? MAJOR_CHROMATIC_SHARP_SIDE
          : key.fifths < 0
            ? MAJOR_CHROMATIC_FLAT_SIDE
            : MAJOR_CHROMATIC_C;
    degree = table[relative];
  }

  let letterIndex = (tonicLetter + degree) % 7;
  let alteration = alterationFor(midi, letterIndex);
  // In a major key a chromatic note never needs a double accidental: A♮ in
  // D♭ major, not B𝄫. (Minor keeps them — F𝄪 IS the leading tone of G♯ minor.)
  if (chromatic && key.mode === "major" && Math.abs(alteration) === 2) {
    letterIndex = (letterIndex + (alteration > 0 ? 1 : 6)) % 7;
    alteration = alterationFor(midi, letterIndex);
  }
  const letter = LETTERS[letterIndex];
  const octave = Math.round((midi - alteration - LETTER_PC[letterIndex]) / 12) - 1;
  return `${letter}${ACCIDENTAL_TEXT[alteration] ?? ""}/${octave}`;
}

// Krumhansl–Kessler key profiles (Krumhansl 1990), indexed by semitones above the tonic.
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function correlation(a: number[], b: number[]): number {
  const meanA = a.reduce((s, x) => s + x, 0) / a.length;
  const meanB = b.reduce((s, x) => s + x, 0) / b.length;
  let num = 0;
  let denA = 0;
  let denB = 0;
  for (let i = 0; i < a.length; i++) {
    num += (a[i] - meanA) * (b[i] - meanB);
    denA += (a[i] - meanA) ** 2;
    denB += (b[i] - meanB) ** 2;
  }
  return denA === 0 || denB === 0 ? 0 : num / Math.sqrt(denA * denB);
}

/** Fifths for a major key by its tonic pitch class, choosing the spelling with fewer accidentals (F♯ over G♭ on the tie). */
const MAJOR_FIFTHS_BY_PC = [0, -5, 2, -3, 4, -1, 6, 1, -4, 3, -2, 5];

export interface KeyScore {
  key: KeyInfo;
  score: number;
}

/** Krumhansl–Schmuckler: correlate a duration-weighted pitch-class histogram with all 24 rotated key profiles. Best first. */
export function rankKeys(notes: { midi: number; weight: number }[]): KeyScore[] {
  const histogram = new Array(12).fill(0);
  for (const note of notes) histogram[((note.midi % 12) + 12) % 12] += Math.max(note.weight, 0);
  const scores: KeyScore[] = [];
  for (let tonic = 0; tonic < 12; tonic++) {
    const rotated = histogram.map((_, i) => histogram[(i + tonic) % 12]);
    scores.push({ key: { fifths: MAJOR_FIFTHS_BY_PC[tonic], mode: "major" }, score: correlation(rotated, MAJOR_PROFILE) });
    // A minor key shares its signature with the major key a minor third up.
    scores.push({
      key: { fifths: MAJOR_FIFTHS_BY_PC[(tonic + 3) % 12], mode: "minor" },
      score: correlation(rotated, MINOR_PROFILE),
    });
  }
  return scores.sort((a, b) => b.score - a.score);
}

export function estimateKey(notes: { midi: number; weight: number }[]): KeyInfo {
  if (notes.length === 0) return { fifths: 0, mode: "major" };
  return rankKeys(notes)[0].key;
}

/**
 * Resolves the key to notate a piece in. A file's own key-signature event
 * wins — it is what the composer/engraver wrote — EXCEPT a bare C major,
 * which is what most sequencers write when nobody set a key (77 of the 270
 * library files that carry a key event say C major, Für Elise among them).
 * For those, and for files with no usable event, the notes decide. Either
 * way the mode (major vs relative minor) comes from the notes, since the
 * signature alone can't distinguish C major from A minor.
 */
export function resolveKey(declared: KeyInfo | null, notes: { midi: number; weight: number }[]): KeyInfo {
  if (notes.length === 0) return declared ?? { fifths: 0, mode: "major" };
  const ranked = rankKeys(notes);
  const declaredIsPlaceholder = !declared || (declared.fifths === 0 && declared.mode === "major");
  if (declaredIsPlaceholder) return ranked[0].key;
  const sameSignature = ranked.filter((r) => r.key.fifths === declared.fifths);
  return sameSignature[0]?.key ?? declared;
}

/**
 * Which accidental glyphs to actually draw in one measure, given each note's
 * spelled key strings in time order. Standard engraving rules:
 *   - a note matching the key signature (and the bar's earlier accidentals) draws nothing;
 *   - an accidental lasts until the barline, for that letter AND octave only;
 *   - a natural is drawn to cancel the signature or an earlier accidental;
 *   - a note tied over from the previous note never redraws its accidental,
 *     and doesn't change what later notes in the bar need.
 * Returns, per note, per key: the VexFlow accidental code to attach, or null.
 */
export function displayAccidentals(
  measure: { keys: string[]; isRest?: boolean; tiedFromPrevious?: boolean }[],
  fifths: number,
): (string | null)[][] {
  const signature = keySignatureAlterations(fifths);
  const state = new Map<string, number>();
  return measure.map((note) =>
    note.keys.map((key) => {
      if (note.isRest) return null;
      const match = /^([a-g])(##|#|bb|b|n)?\/(-?\d+)$/i.exec(key);
      if (!match) return null;
      const letter = match[1].toLowerCase();
      const accidental = match[2] ?? "";
      const alteration = accidental === "##" ? 2 : accidental === "#" ? 1 : accidental === "bb" ? -2 : accidental === "b" ? -1 : 0;
      const slot = `${letter}${match[3]}`;
      const current = state.get(slot) ?? signature[letter];
      if (note.tiedFromPrevious) return null;
      if (current === alteration) return null;
      state.set(slot, alteration);
      return alteration === 0 ? "n" : ACCIDENTAL_TEXT[alteration];
    }),
  );
}
