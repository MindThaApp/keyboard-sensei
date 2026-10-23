import type { AuthoredScore } from "./notation.js";

/**
 * The tune as transcribed in The Session (setting 24502), moved from E minor to A minor, two verses. The left hand is simple chords.
 */
export const korobeiniki: AuthoredScore = {
  meter: [2, 4],
  bpm: 124,
  melody: [
    "E5 q, B4 e, C5 e | D5 q, C5 e, B4 e | A4 q, A4 e, C5 e | E5 q, D5 e, C5 e",
    "B4 q., C5 e | D5 q, E5 q | C5 q, A4 q | A4 q, r q",
    "D5 q~, D5 e, F5 e | A5 q, G5 e, F5 e | E5 q., C5 e | E5 q, D5 e, C5 e",
    "B4 q, B4 e, C5 e | D5 q, E5 q | C5 q, A4 q | A4 q, r q",
    "E5 q, B4 e, C5 e | D5 q, C5 e, B4 e | A4 q, A4 e, C5 e | E5 q, D5 e, C5 e",
    "B4 q., C5 e | D5 q, E5 q | C5 q, A4 q | A4 q, r q",
    "D5 q~, D5 e, F5 e | A5 q, G5 e, F5 e | E5 q., C5 e | E5 q, D5 e, C5 e",
    "B4 q, B4 e, C5 e | D5 q, E5 q | C5 q, A4 q | A4 q, r q",
  ].join(" | "),
  left: [
    [
      "A2 q, C3+E3 q | E2 q, G3+B3 q | A2 q, C3+E3 q | A2 q, C3+E3 q",
      "E2 q, G3+B3 q | D2 q, F3+A3 q | A2 q, C3+E3 q | A2 q, C3+E3 q",
      "D2 q, F3+A3 q | D2 q, F3+A3 q | A2 q, C3+E3 q | A2 q, C3+E3 q",
      "E2 q, G3+B3 q | D2 q, F3+A3 q | A2 q, C3+E3 q | A2+C3+E3 h",
      "A2 q, C3+E3 q | E2 q, G3+B3 q | A2 q, C3+E3 q | A2 q, C3+E3 q",
      "E2 q, G3+B3 q | D2 q, F3+A3 q | A2 q, C3+E3 q | A2 q, C3+E3 q",
      "D2 q, F3+A3 q | D2 q, F3+A3 q | A2 q, C3+E3 q | A2 q, C3+E3 q",
      "E2 q, G3+B3 q | D2 q, F3+A3 q | A2 q, C3+E3 q | A2+C3+E3 h",
    ].join(" | "),
  ],
};
