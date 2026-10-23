import type { AuthoredScore } from "./notation.js";

/**
 * The song as transcribed in the Essen Folksong Collection (B0638), one verse. The left hand is simple chords.
 */
export const oChristmasTree: AuthoredScore = {
  meter: [3, 4],
  bpm: 100,
  pickupBeats: 1,
  melody: [
    "D4 q | G4 e., G4 s, G4 q, A4 q | B4 e., B4 s, B4 q., G4 e | A4 e, B4 e, C5 q, F#4 q",
    "A4 q, G4 q, r e, B4 e | D5 e, B4 e, E5 q., D5 e | D5 e., C5 s, C5 q., C5 e | C5 e, A4 e, D5 q., C5 e",
    "C5 e., B4 s, B4 q, D4 q | G4 e., G4 s, G4 q, A4 q | B4 e., B4 s, B4 q., G4 e | A4 e, B4 e, C5 q, F#4 q",
    "A4 q, G4 q",
  ].join(" | "),
  left: [
    [
      "r q | G2 q, B3+D4 q, B3+D4 q | G2 q, B3+D4 q, B3+D4 q | D2 q, F#3+C4 q, F#3+C4 q",
      "G2 q, B3+D4 q, B3+D4 q | E2 q, G3+B3 q, G3+B3 q | D2 q, F#3+C4 q, F#3+C4 q | D2 q, F#3+C4 q, F#3+C4 q",
      "G2 q, B3+D4 q, B3+D4 q | G2 q, B3+D4 q, B3+D4 q | G2 q, B3+D4 q, B3+D4 q | D2 q, F#3+C4 q, F#3+C4 q",
      "G2+B3+D4 h",
    ].join(" | "),
  ],
};
