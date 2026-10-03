import type { AuthoredScore } from "./notation.js";

/**
 * The can-can theme of the Galop from Heugel's piano solo score of Orphée
 * aux enfers (Paris, c.1862), written an octave below its 8va marking, with
 * that edition's harmony: a bass-and-chords galop left hand and thirds and
 * sixths under the tune. The theme is followed by the strain that comes next in
 * the score, stated twice.
 */
const D = "D3 e, F#3+A3+D4 e, F#3+A3+D4 e, F#3+A3+D4 e";
const A7 = "A2 e, G3+C#4+E4 e, G3+C#4+E4 e, G3+C#4+E4 e";

// The strain that follows the theme (Weninger, André): E–F♯ over A and C, then
// the run A–G–C♯–B, A–G–F♯–E, played twice.
const STRAIN_TUNE = "E5 q, F#5 q | A5 e, G5 e, C#6 e, B5 e | A5 e, G5 e, F#5 e, E5 e | D5 q, D5 q";
const STRAIN_INNER = "G4+C#5 q, A4+C5 q | D5 e, B4 e, E5 e, G5 e | E5 e, C#5 e, A4 e, G4 e | F#4+A4 q, F#4+A4 q";
const STRAIN_LH = `A2 e, E3+G3+C#4 e, C3 e, F#3+A3+D4 e | G2 e, G3+B3+D4 e, E2 e, G3+A3+C#4 e | ${A7} | ${D}`;

export const canCan: AuthoredScore = {
  meter: [2, 4],
  bpm: 132,
  melody: [
    "D5 h",
    "E5 e, G5 e, F#5 e, E5 e | A5 q, A5 q | A5 e, B5 e, F#5 e, G5 e | E5 q, E5 q",
    "E5 e, G5 e, F#5 e, E5 e | D5 e, D6 e, C#6 e, B5 e | A5 e, G5 e, F#5 e, E5 e | D5 h",
    "E5 e, G5 e, F#5 e, E5 e | A5 q, A5 q | A5 e, B5 e, F#5 e, G5 e | E5 q, E5 q",
    "E5 e, G5 e, F#5 e, E5 e | D5 e, A5 e, E5 e, F#5 e | D5 q, D5 q",
    STRAIN_TUNE,
    STRAIN_TUNE.replace(/D5 q, D5 q$/, "D5 q, r q"),
  ].join(" | "),
  right: [
    [
      "F#4+A4 h",
      "C#5 e, E5 e, D5 e, C#5 e | A4 q, A4 q | F#5 e, G5 e, D5 e, E5 e | G4+C#5 q, G4+C#5 q",
      "C#5 e, E5 e, D5 e, C#5 e | F#4 e, F#5 e, E5 e, D5 e | G4+C#5 h | F#4+A4 h",
      "C#5 e, E5 e, D5 e, C#5 e | A4 q, A4 q | F#5 e, G5 e, D5 e, E5 e | G4+C#5 q, G4+C#5 q",
      "C#5 e, E5 e, D5 e, C#5 e | F#4+A4 e, F#5 e, C#5 e, D5 e | F#4+A4 q, F#4+A4 q",
      STRAIN_INNER,
      STRAIN_INNER.replace(/F#4\+A4 q, F#4\+A4 q$/, "F#4+A4 q, r q"),
    ].join(" | "),
  ],
  left: [
    [
      D,
      `${A7} | ${D} | ${D} | ${A7}`,
      `${A7} | ${D} | ${A7} | ${D}`,
      `${A7} | ${D} | ${D} | ${A7}`,
      `${A7} | D3+F#3+A3 e, r e, A2+G3+C#4 e, A2+G3+C#4 e | ${D}`,
      STRAIN_LH,
      STRAIN_LH.replace(/D3 e, F#3\+A3\+D4 e, F#3\+A3\+D4 e, F#3\+A3\+D4 e$/, "D3+F#3+A3 q, r q"),
    ].join(" | "),
  ],
};
