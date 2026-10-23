import type { AuthoredScore } from "./notation.js";

/**
 * The folk song (Gyeonggi Arirang) as transcribed in John Chambers' ABC collection, checked against the Wikipedia score (moved from F, in 3/4). Both strains. The left hand is simple chords.
 */
export const arirang: AuthoredScore = {
  meter: [3, 4],
  bpm: 72,
  melody: [
    "D4 q., E4 e, D4 e, E4 e | G4 q., A4 e, G4 e, A4 e | B4 q, A4 e3, B4 e3, A4 e3, G4 e, E4 e | D4 q., E4 e, D4 e, E4 e",
    "G4 q., A4 e, G4 e, A4 e | B4 e, A4 e, G4 e, E4 e, D4 e, E4 e | G4 q., A4 e, G4 q | G4 h.",
    "D5 h, D5 q | D5 q, B4 q, A4 q | B4 q, A4 e3, B4 e3, A4 e3, G4 e, E4 e | D4 q., E4 e, D4 e, E4 e",
    "G4 q., A4 e, G4 e, A4 e | B4 e, A4 e, G4 e, E4 e, D4 e, E4 e | G4 q., A4 e, G4 q | G4 h.",
  ].join(" | "),
  left: [
    [
      "G2 q, B3+D4 q, B3+D4 q | G2 q, B3+D4 q, B3+D4 q | G2 q, B3+D4 q, B3+D4 q | D2 q, F#3+C4 q, F#3+C4 q",
      "G2 q, B3+D4 q, B3+D4 q | E2 q, G3+B3 q, G3+B3 q | C3 q, E3+G3 q, E3+G3 q | G2 q, B3+D4 q, B3+D4 q",
      "B2 q, D3+F#3 q, D3+F#3 q | D2 q, F#3+C4 q, F#3+C4 q | G2 q, B3+D4 q, B3+D4 q | D2 q, F#3+C4 q, F#3+C4 q",
      "G2 q, B3+D4 q, B3+D4 q | E2 q, G3+B3 q, G3+B3 q | C3 q, E3+G3 q, E3+G3 q | G2+B3+D4 h.",
    ].join(" | "),
  ],
};
