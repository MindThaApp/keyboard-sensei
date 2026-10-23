import type { AuthoredScore } from "./notation.js";

/**
 * The carol as transcribed in Colin Hume's ABC collection, one verse. The left hand is simple chords.
 */
export const coventryCarol: AuthoredScore = {
  meter: [3, 4],
  bpm: 92,
  melody: [
    "A4 q, A4 q, G#4 q | A4 h, C5 q | B4 h, A4 q | G#4 h.",
    "A4 q, B4 q, C5 q | D5 h, B4 q | A4 h.~ | A4 q, r q, E5 q",
    "D5 h, C5 q | B4 h, C5 q | B4 h, A4 q | G#4 h.",
    "A4 q, G#4 q, A4 q | D5 h, B4 q | C#5 h.~ | C#5 h, r q",
  ].join(" | "),
  left: [
    [
      "A2 q, C3+E3 h | A2 q, C3+E3 h | E2 q, G#3+B3 h | E2 q, G#3+B3 h",
      "A2 q, C3+E3 h | G2 q, B3+D4 h | A2 q, C3+E3 h | A2 q, C3+E3 h",
      "G2 q, B3+D4 h | E2 q, G#3+B3 h | E2 q, G#3+B3 h | E2 q, G#3+B3 h",
      "A2 q, C3+E3 h | G2 q, B3+D4 h | A2 q, C#3+E3 h | A2+C#3+E3 h.",
    ].join(" | "),
  ],
};
