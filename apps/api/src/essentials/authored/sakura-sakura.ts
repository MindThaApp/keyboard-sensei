import type { AuthoredScore } from "./notation.js";

/**
 * The tune as transcribed in the Essen Folksong Collection (test0, no. 5), one verse. The left hand is simple A minor chords.
 */
export const sakuraSakura: AuthoredScore = {
  meter: [4, 4],
  bpm: 66,
  melody: [
    "A4 q, A4 q, B4 q, r q | A4 q, A4 q, B4 q., r e | A4 q, B4 q, C5 q, B4 q | A4 q, B4 e, A4 e, F4 q., r e",
    "E4 q, C4 q, E4 q, F4 q | E4 q, E4 e, C4 e, B3 q., r e | A4 q, B4 q, C5 q, B4 q | A4 q, B4 e, A4 e, F4 q., r e",
    "E4 q, C4 q, E4 q, F4 q | E4 q, E4 e, C4 e, B3 q., r e | A4 q, A4 q, B4 q, r q | A4 q, A4 q, B4 h",
    "r q, E4 q, F4 h | B4 e, A4 e, F4 q, E4 h",
  ].join(" | "),
  left: [
    [
      "A2 h, C3+E3 h | A2 h, C3+E3 h | A2 h, C3+E3 h | A2 q, C3+E3 q, D2 q, F3+A3 q",
      "A2 q, C3+E3 q, D2 q, F3+A3 q | A2 q, C3+E3 q, E2 q, G3+B3 q | A2 h, C3+E3 h | A2 q, C3+E3 q, D2 q, F3+A3 q",
      "A2 q, C3+E3 q, D2 q, F3+A3 q | A2 q, C3+E3 q, E2 q, G3+B3 q | A2 h, C3+E3 h | A2 h, C3+E3 h",
      "A2 q, C3+E3 q, D2 q, F3+A3 q | D2 q, F3+A3 q, A2 q, C3+E3 q",
    ].join(" | "),
  ],
};
