import type { AuthoredScore } from "./notation.js";

/**
 * The air as transcribed in The Session (setting 25640), moved from D to G, one strain. The left hand is simple chords.
 */
export const lochLomond: AuthoredScore = {
  meter: [4, 4],
  bpm: 80,
  pickupBeats: 1,
  melody: [
    "D4 e, E4 e | G4 q, G4 e, A4 e, B4 q, B4 e, A4 e | G4 q, G4 e, E4 e, D4 q, D4 e, E4 e | G4 q, G4 e, G4 e, G4 q, B4 e, D5 e",
    "E5 h, D5 q., D5 e | E5 q, E5 e, D5 e, B4 q, B4 e, D5 e | C5 e, B4 e, A4 e, G4 e, E4 q, D4 e, E4 e | G4 q, B4 e, D5 e, E5 q, D5 e, B4 e",
    "A4 h, G4 h",
  ].join(" | "),
  left: [
    [
      "r q | G2 q, B3+D4 q, D2 q, B3+D4 q | G2 q, B3+D4 q, E2 q, G3+B3 q | G2 q, B3+D4 q, D2 q, B3+D4 q",
      "C3 q, E3+G3 q, G2 q, B3+D4 q | C3 q, E3+G3 q, G2 q, B3+D4 q | A2 q, C3+E3 q, D2 q, F#3+C4 q | G2 q, B3+D4 q, D2 q, B3+D4 q",
      "D2 q, F#3+C4 q, G2 q, B3+D4 q",
    ].join(" | "),
  ],
};
