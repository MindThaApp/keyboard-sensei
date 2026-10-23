import type { AuthoredScore } from "./notation.js";

/**
 * The air as transcribed in The Session (setting 31954), one verse. The left hand is simple chords.
 */
export const theWaterIsWide: AuthoredScore = {
  meter: [3, 4],
  bpm: 72,
  melody: [
    "D4 q, G4 q, G4 e, A4 e | B4 h, A4 e, A4 e | G4 q, E4 q, D4 q | D4 q, G4 q, F#4 q",
    "G4 h. | A4 q, B4 q, C5 e, B4 e | A4 h. | G4 q, A4 q, B4 e, C5 e",
    "D5 h, C5 q | B4 h, A4 e, G4 e | B4 h. | A4 q, G4 q, E4 q",
    "D4 h, D4 q | D4 h, E4 e, F#4 e | G4 h.",
  ].join(" | "),
  left: [
    [
      "G2 q, B3+D4 h | G2 q, B3+D4 h | E2 q, G3+B3 h | D2 q, F#3+C4 h",
      "G2 q, B3+D4 h | A2 q, C3+E3 h | D2 q, F#3+C4 h | G2 q, B3+D4 h",
      "G2 q, B3+D4 h | E2 q, G3+B3 h | G2 q, B3+D4 h | C3 q, E3+G3 h",
      "D2 q, F#3+C4 h | D2 q, F#3+C4 h | G2+B3+D4 h.",
    ].join(" | "),
  ],
};
