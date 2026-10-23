import type { AuthoredScore } from "./notation.js";

/**
 * The carol as printed in The Everyday Song Book (1927, no. 154): verse and refrain. The left hand is simple chords.
 */
export const weThreeKings: AuthoredScore = {
  meter: [3, 8],
  bpm: 100,
  melody: [
    "B4 q, A4 e | G4 q, E4 e | F#4 e, G4 e, F#4 e | E4 q, r e",
    "B4 q, A4 e | G4 q, E4 e | F#4 e, G4 e, F#4 e | E4 q, r e",
    "G4 q, G4 e | A4 q, A4 e | B4 q, B4 e | D5 e, C5 e, B4 e",
    "A4 e, B4 e, A4 e | G4 q, F#4 e | E4 q, r e | F#4 q, A4 e",
    "G4 q, G4 e | G4 q, D4 e | G4 q, E4 e | G4 q, r e",
    "G4 q, G4 e | G4 q, D4 e | G4 q, E4 e | G4 q, r e",
    "G4 q, G4 e | A4 q, B4 e | C5 q, B4 e | A4 q, B4 e",
    "G4 q, G4 e | G4 q, D4 e | G4 q, E4 e | G4 q.",
  ].join(" | "),
  left: [
    [
      "E2 e, G3+B3 e, G3+B3 e | E2 e, G3+B3 e, G3+B3 e | B2 e, D#3+A3 e, D#3+A3 e | E2 e, G3+B3 e, G3+B3 e",
      "E2 e, G3+B3 e, G3+B3 e | E2 e, G3+B3 e, G3+B3 e | B2 e, D#3+A3 e, D#3+A3 e | E2 e, G3+B3 e, G3+B3 e",
      "G2 e, B3+D4 e, B3+D4 e | D2 e, F#3+A3 e, F#3+A3 e | G2 e, B3+D4 e, B3+D4 e | B2 e, D3+F#3 e, D3+F#3 e",
      "A2 e, C3+E3 e, C3+E3 e | B2 e, D#3+A3 e, D#3+A3 e | E2 e, G3+B3 e, G3+B3 e | D2 e, F#3+A3 e, F#3+A3 e",
      "G2 e, B3+D4 e, B3+D4 e | G2 e, B3+D4 e, B3+D4 e | C3 e, E3+G3 e, E3+G3 e | G2 e, B3+D4 e, B3+D4 e",
      "G2 e, B3+D4 e, B3+D4 e | G2 e, B3+D4 e, B3+D4 e | C3 e, E3+G3 e, E3+G3 e | G2 e, B3+D4 e, B3+D4 e",
      "G2 e, B3+D4 e, B3+D4 e | D2 e, F#3+A3 e, F#3+A3 e | C3 e, E3+G3 e, E3+G3 e | D2 e, F#3+A3 e, F#3+A3 e",
      "G2 e, B3+D4 e, B3+D4 e | G2 e, B3+D4 e, B3+D4 e | C3 e, E3+G3 e, E3+G3 e | G2+B3+D4 q.",
    ].join(" | "),
  ],
};
