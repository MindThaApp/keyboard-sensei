import type { AuthoredScore } from "./notation.js";

/**
 * The song as transcribed in Colin Hume's ABC collection, one verse. The left hand is simple chords.
 */
export const redRiverValley: AuthoredScore = {
  meter: [2, 2],
  bpm: 96,
  pickupBeats: 2,
  melody: [
    "D4 q, G4 q | B4 h, B4 h | B4 h, A4 q., B4 e | A4 q, G4 h.~",
    "G4 h, D4 q, G4 q | B4 h, G4 q, B4 q | D5 h, C5 q, B4 q | A4 w~",
    "A4 h, D5 q, C5 q | B4 h, B4 q, A4 q | G4 h, A4 q, B4 q | D5 q, C5 h.~",
    "C5 h, E4 q, E4 q | D4 h, F#4 q, G4 q | A4 h, B4 q, A4 q | G4 h~, G4 h~",
    "G4 h",
  ].join(" | "),
  left: [
    [
      "r h | G2 q, B3+D4 q, D2 q, B3+D4 q | G2 q, B3+D4 q, D2 q, F#3+C4 q | D2 q, F#3+C4 q, G2 q, B3+D4 q",
      "G2 q, B3+D4 q, D2 q, B3+D4 q | G2 q, B3+D4 q, D2 q, B3+D4 q | G2 q, B3+D4 q, D2 q, B3+D4 q | D2 q, F#3+C4 q, A2 q, F#3+C4 q",
      "D2 q, F#3+C4 q, A2 q, F#3+C4 q | G2 q, B3+D4 q, D2 q, B3+D4 q | G2 q, B3+D4 q, D2 q, B3+D4 q | C3 q, E3+G3 q, G2 q, E3+G3 q",
      "C3 q, E3+G3 q, G2 q, E3+G3 q | D2 q, F#3+C4 q, A2 q, F#3+C4 q | D2 q, F#3+C4 q, A2 q, F#3+C4 q | G2 q, B3+D4 q, D2 q, B3+D4 q",
      "G2+B3+D4 h",
    ].join(" | "),
  ],
};
