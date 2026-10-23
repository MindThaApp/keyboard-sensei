import type { AuthoredScore } from "./notation.js";

/**
 * The tune as transcribed in The Session (setting 46149), one verse. The left hand is simple chords.
 */
export const morningHasBroken: AuthoredScore = {
  meter: [3, 4],
  bpm: 80,
  melody: [
    "D4 q, F#4 q, A4 q | D5 h. | E5 h. | C#5 q, B4 q, A4 q",
    "B4 q., C#5 e, B4 q | A4 h. | D4 q, E4 q, F#4 q | A4 h.",
    "B4 h. | A4 q, F#4 q, D4 q | E4 h.~ | E4 h.",
    "A4 q, F#4 q, A4 q | D5 h. | B4 h. | A4 q, F#4 q, D4 q",
    "D4 h. | E4 h. | F#4 q, E4 q, F#4 q | A4 h.",
    "B4 h. | E4 q, F#4 q, E4 q | D4 h.~ | D4 h.",
  ].join(" | "),
  left: [
    [
      "D2 q, F#3+A3 h | D2 q, F#3+A3 h | E2 q, G3+B3 h | A2 q, C#3+E3 h",
      "G2 q, B3+D4 h | D2 q, F#3+A3 h | D2 q, F#3+A3 h | F#2 q, A3+C#4 h",
      "G2 q, B3+D4 h | D2 q, F#3+A3 h | A2 q, C#3+E3 h | A2 q, C#3+G3 h",
      "D2 q, F#3+A3 h | G2 q, B3+D4 h | G2 q, B3+D4 h | D2 q, F#3+A3 h",
      "B2 q, D3+F#3 h | A2 q, C#3+E3 h | D2 q, F#3+A3 h | F#2 q, A3+C#4 h",
      "G2 q, B3+D4 h | A2 q, C#3+E3 h | D2 q, F#3+A3 h | D2+F#3+A3 h.",
    ].join(" | "),
  ],
};
