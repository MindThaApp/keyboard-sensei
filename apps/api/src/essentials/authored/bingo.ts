import type { AuthoredScore } from "./notation.js";

/**
 * The tune as printed in The Everyday Song Book (1927, no. 138), played twice. The left hand is simple chords.
 */
export const bingo: AuthoredScore = {
  meter: [4, 4],
  bpm: 96,
  melody: [
    "G4 e, G4 e, F#4 e, F#4 e, G4 e, G4 e, D4 e, D4 e | E4 e, E4 e, F#4 e, F#4 e, G4 q, G4 q | B4 e, B4 e, B4 q, C5 e, C5 e, C5 q | A4 e, A4 e, A4 q, B4 e, B4 e, B4 q",
    "G4 e, G4 e, G4 q, A4 e, A4 e, A4 q | F#4 e, F#4 e, E4 e, F#4 e, G4 q, G4 q | G4 e, G4 e, F#4 e, F#4 e, G4 e, G4 e, D4 e, D4 e | E4 e, E4 e, F#4 e, F#4 e, G4 q, G4 q",
    "B4 e, B4 e, B4 q, C5 e, C5 e, C5 q | A4 e, A4 e, A4 q, B4 e, B4 e, B4 q | G4 e, G4 e, G4 q, A4 e, A4 e, A4 q | F#4 e, F#4 e, E4 e, F#4 e, G4 q, G4 q",
  ].join(" | "),
  left: [
    [
      "G2 q, B3+D4 q, D2 q, B3+D4 q | G2 q, B3+D4 q, D2 q, B3+D4 q | G2 q, B3+D4 q, C3 q, E3+G3 q | D2 q, F#3+A3 q, G2 q, B3+D4 q",
      "G2 q, B3+D4 q, D2 q, F#3+A3 q | D2 q, F#3+A3 q, G2 q, B3+D4 q | G2 q, B3+D4 q, D2 q, B3+D4 q | G2 q, B3+D4 q, D2 q, B3+D4 q",
      "G2 q, B3+D4 q, C3 q, E3+G3 q | D2 q, F#3+A3 q, G2 q, B3+D4 q | G2 q, B3+D4 q, D2 q, F#3+A3 q | D2 q, F#3+A3 q, G2 q, B3+D4 q",
    ].join(" | "),
  ],
};
