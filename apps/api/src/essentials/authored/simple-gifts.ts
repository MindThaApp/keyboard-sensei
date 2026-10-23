import type { AuthoredScore } from "./notation.js";

/**
 * The song as transcribed in Colin Hume's ABC collection, the first two strains. The left hand is simple chords.
 */
export const simpleGifts: AuthoredScore = {
  meter: [2, 2],
  bpm: 100,
  pickupBeats: 2,
  melody: [
    "D4 q, D4 q | G4 h, G4 q, A4 q | B4 q, G4 q, B4 q, C5 q | D5 h, D5 q, C5 q",
    "B4 h, A4 q, G4 q | A4 h, A4 h | A4 h, A4 h | A4 q, B4 q, A4 q, F#4 q",
    "D4 h, D4 h | G4 q, F#4 q, G4 q, A4 q | B4 h, A4 q, A4 q | B4 h, C5 h",
    "D5 h., B4 q | A4 h, A4 q, B4 q | A4 h, G4 q, G4 q | A4 h, G4 q, F#4 q",
    "G4 w",
  ].join(" | "),
  left: [
    [
      "r h | G2 q, B3+D4 q, D2 q, B3+D4 q | G2 q, B3+D4 q, D2 q, B3+D4 q | G2 q, B3+D4 q, D2 q, B3+D4 q",
      "E2 q, G3+B3 q, B2 q, G3+B3 q | A2 q, C3+E3 q, E2 q, C3+E3 q | A2 q, C3+E3 q, E2 q, C3+E3 q | D2 q, F#3+A3 q, A2 q, F#3+A3 q",
      "D2 q, F#3+C4 q, A2 q, F#3+C4 q | G2 q, B3+D4 q, D2 q, B3+D4 q | G2 q, B3+D4 q, D2 q, B3+D4 q | E2 q, G3+B3 q, B2 q, G3+B3 q",
      "G2 q, B3+D4 q, D2 q, B3+D4 q | A2 q, C3+E3 q, E2 q, C3+E3 q | D2 q, F#3+C4 q, A2 q, F#3+C4 q | D2 q, F#3+C4 q, A2 q, F#3+C4 q",
      "G2+B3+D4 w",
    ].join(" | "),
  ],
};
