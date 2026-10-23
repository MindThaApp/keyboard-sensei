import type { AuthoredScore } from "./notation.js";

/**
 * The theme of the Sinfonia "The Arrival of the Queen of Sheba" (Handel, Solomon, HWV 67, 1748) in G major, as set in Colin Hume's
 * ABC collection (X:48, in B-flat) and in The Session (setting 28604, tune 15342, in G). The two agree in all 32 bars, pitch for
 * pitch, once the first is moved down a minor third. Where The Session jumps an octave in a falling run (bars 20 and 21) the
 * stepwise octave of Hume's version is used. The left hand is simple chords.
 */
export const arrivalOfTheQueenOfSheba: AuthoredScore = {
  meter: [4, 4],
  bpm: 120,
  melody: [
    "G5 e, D5 e, B4 e, D5 e, G5 e, D5 e, B4 e, D5 e | G5 e, D5 e, B4 e, D5 e, G5 e, D5 e, B4 e, D5 e | A4 e, G5 e, F#5 e, E5 e, D5 e, C5 e, B4 e, A4 e | B4 e, G4 e, A4 e, B4 e, C5 e, D5 e, E5 e, F#5 e",
    "G5 e, D5 e, B4 e, D5 e, G5 e, D5 e, B4 e, D5 e | G5 e, C#5 e, A4 e, C#5 e, G5 e, E5 e, A4 e, E5 e | F#5 e, E5 e, D5 e, E5 e, A4 q, C#5 q | D5 q, A4 e, B4 e, A4 e, B4 e, A4 e, B4 e",
    "A4 e, F#4 e, D4 e, F#4 e, A4 e, F#4 e, D4 e, F#4 e | D5 e, B4 e, G4 e, B4 e, D5 e, B4 e, G4 e, B4 e | C5 e, A4 e, F#4 e, A4 e, C5 e, A4 e, F#4 e, A4 e | B4 e, D4 e, E4 e, F#4 e, G4 e, A4 e, B4 e, C5 e",
    "D5 e, B4 e, G4 e, B4 e, D5 e, B4 e, G4 e, B4 e | D5 e, A4 e, F#4 e, A4 e, D5 e, A4 e, F#4 e, A4 e | B4 e, G4 e, E4 e, G4 e, B4 e, G4 e, E4 e, G4 e | B4 e, F#4 e, D4 e, F#4 e, B4 e, F#4 e, D4 e, F#4 e",
    "G5 e, E5 e, C5 e, E5 e, G5 e, E5 e, C5 e, E5 e | G5 e, D5 e, B4 e, D5 e, G5 e, D5 e, B4 e, D5 e | C5 e, D5 e, E5 e, D5 e, C5 e, B4 e, A4 e, G4 e | F#4 e, G4 e, A4 e, G4 e, F#4 e, E4 e, D4 e, C4 e",
    "B3 e, D4 e, C4 e, E4 e, D4 e, F#4 e, E4 e, G4 e | F#4 e, A4 e, G4 e, B4 e, A4 e, C5 e, B4 e, D5 e | C5 e, D5 e, C5 e, D5 e, E5 e, D5 e, C5 e, B4 e | A4 e, B4 e, A4 e, B4 e, C5 e, D5 e, C5 e, D5 e",
    "E5 e, D5 e, E5 e, D5 e, C5 e, B4 e, C5 e, B4 e | A4 e, B4 e, A4 e, B4 e, C5 e, D5 e, C5 e, D5 e | E5 e, D5 e, E5 e, D5 e, C5 e, B4 e, C5 e, B4 e | A4 e, B4 e, A4 e, B4 e, C5 e, B4 e, C5 e, A4 e",
    "B4 e, D5 e, C5 e, E5 e, D5 e, F#5 e, E5 e, G5 e | F#5 q, E5 e, D5 e, G5 q, C5 q | B4 q, A4 e, G4 e, D4 q, F#4 q | G4 q, D4 q, G3 h",
  ].join(" | "),
  left: [
    [
      "G2 h, B3+D4 h | G2 h, B3+D4 h | D2 h, F#3+A3 h | G2 h, B3+D4 h",
      "G2 h, B3+D4 h | A2 h, C#3+E3 h | A2 h, C#3+E3 h | D2 h, F#3+A3 h",
      "D2 h, F#3+A3 h | G2 h, B3+D4 h | D2 h, F#3+A3 h | G2 h, B3+D4 h",
      "G2 h, B3+D4 h | D2 h, F#3+A3 h | E2 h, G3+B3 h | B2 h, D3+F#3 h",
      "C3 h, E3+G3 h | G2 h, B3+D4 h | C3 h, E3+G3 h | D2 h, F#3+A3 h",
      "G2 h, B3+D4 h | D2 h, F#3+A3 h | C3 h, E3+G3 h | A2 h, C3+E3 h",
      "C3 h, E3+G3 h | A2 h, C3+E3 h | C3 h, E3+G3 h | A2 h, C3+E3 h",
      "G2 h, B3+D4 h | D2 q, F#3+A3 q, C3 q, E3+G3 q | G2 q, B3+D4 q, D2 q, F#3+A3 q | G2 h, B3+D4 h",
    ].join(" | "),
  ],
};
