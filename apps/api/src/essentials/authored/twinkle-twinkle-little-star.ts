import type { AuthoredScore } from "./notation.js";

/**
 * The tune in Mozart's register (C5), with the bass of his theme to the
 * K. 265 variations, two of his 2/4 bars to each 4/4 bar here.
 */
export const twinkleTwinkleLittleStar: AuthoredScore = {
  meter: [4, 4],
  bpm: 100,
  melody: [
    "C5 q, C5 q, G5 q, G5 q | A5 q, A5 q, G5 h | F5 q, F5 q, E5 q, E5 q | D5 q, D5 q, C5 h",
    "G5 q, G5 q, F5 q, F5 q | E5 q, E5 q, D5 h | G5 q, G5 q, F5 q, F5 q | E5 q, E5 q, D5 h",
    "C5 q, C5 q, G5 q, G5 q | A5 q, A5 q, G5 h | F5 q, F5 q, E5 q, E5 q | D5 q, D5 q, C5 h",
  ].join(" | "),
  left: [
    [
      "C3 q, C4 q, E4 q, C4 q | F4 q, C4 q, E4 q, C4 q | D4 q, B3 q, C4 q, A3 q | F3 q, G3 q, C3 h",
      "E4 q, G3 q, D4 q, G3 q | C4 q, G3 q, B3 q, G3 q | E4 q, G3 q, D4 q, G3 q | C4 q, G3 q, B3 q, G3 q",
      "C3 q, C4 q, E4 q, C4 q | F4 q, C4 q, E4 q, C4 q | D4 q, B3 q, C4 q, A3 q | F3 q, G3 q, C3 h",
    ].join(" | "),
  ],
};
