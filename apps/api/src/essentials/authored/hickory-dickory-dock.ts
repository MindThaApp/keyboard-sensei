import type { AuthoredScore } from "./notation.js";

/**
 * The tune as printed in The Everyday Song Book (1927, no. 19), played twice. The left hand is simple chords.
 */
export const hickoryDickoryDock: AuthoredScore = {
  meter: [6, 8],
  bpm: 100,
  melody: [
    "A4 e, A#4 e, C5 e, A#4 e, C5 e, G4 e | A4 e, r e, r e, r q, A4 e | A4 e, r e, C5 e, A#4 e, r e, G4 e | A4 e, r e, r e, r q, A4 e",
    "A4 e, r e, A4 e, C5 q, C5 e | A#4 e, r e, A#4 e, D5 q. | C5 e, D5 e, C5 e, A#4 e, A4 e, G4 e | F4 e, r e, r e, r q, r e",
    "A4 e, A#4 e, C5 e, A#4 e, C5 e, G4 e | A4 e, r e, r e, r q, A4 e | A4 e, r e, C5 e, A#4 e, r e, G4 e | A4 e, r e, r e, r q, A4 e",
    "A4 e, r e, A4 e, C5 q, C5 e | A#4 e, r e, A#4 e, D5 q. | C5 e, D5 e, C5 e, A#4 e, A4 e, G4 e | F4 e, r e, r e, r q, r e",
  ].join(" | "),
  left: [
    [
      "F2 q., A3+C4 q. | F2 q., A3+C4 q. | C3 q., E3+A#3 q. | F2 q., A3+C4 q.",
      "F2 q., A3+C4 q. | A#2 q., D3+F3 q. | C3 q., E3+A#3 q. | F2+A3+C4 h.",
      "F2 q., A3+C4 q. | F2 q., A3+C4 q. | C3 q., E3+A#3 q. | F2 q., A3+C4 q.",
      "F2 q., A3+C4 q. | A#2 q., D3+F3 q. | C3 q., E3+A#3 q. | F2+A3+C4 h.",
    ].join(" | "),
  ],
};
