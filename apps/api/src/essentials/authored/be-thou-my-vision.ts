import type { AuthoredScore } from "./notation.js";

/**
 * The melody as transcribed in The Session (setting 6415), one verse. The left hand is simple chords.
 */
export const beThouMyVision: AuthoredScore = {
  meter: [3, 4],
  bpm: 76,
  pickupBeats: 1,
  melody: [
    "D4 q | G4 q, G4 q, A4 e, G4 e | E4 q, D4 q, D4 e, E4 e | G4 q, G4 q, A4 q",
    "B4 h, D5 e, B4 e | A4 q, A4 q, A4 q | A4 q, B4 q, D5 q | E5 q, D5 q, B4 q",
    "D5 h, D5 q | E5 q, E5 e, F#5 e, G5 e, F#5 e | E5 q, D5 q, B4 q | D5 q, G4 q, F#4 q",
    "E4 h, D4 q | G4 q, B4 q, D5 q | E5 e, D5 e, B4 q, G4 e, B4 e | A4 q, G4 q, G4 q",
    "G4 h",
  ].join(" | "),
  left: [
    [
      "r q | G2 q, B3+D4 h | E2 q, G3+B3 h | G2 q, B3+D4 h",
      "G2 q, B3+D4 h | D2 q, F#3+A3 h | D2 q, F#3+A3 h | E2 q, G3+B3 h",
      "G2 q, B3+D4 h | E2 q, G3+B3 h | E2 q, G3+B3 h | D2 q, F#3+A3 h",
      "C3 q, E3+G3 h | G2 q, B3+D4 h | E2 q, G3+B3 h | D2 q, F#3+A3 h",
      "G2+B3+D4 h",
    ].join(" | "),
  ],
};
