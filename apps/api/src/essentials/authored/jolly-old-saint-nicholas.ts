import type { AuthoredScore } from "./notation.js";

/**
 * The tune as printed in The Everyday Song Book (1927, no. 21), one verse. The left hand is simple chords.
 */
export const jollyOldSaintNicholas: AuthoredScore = {
  meter: [2, 4],
  bpm: 88,
  melody: [
    "C#5 e, C#5 e, C#5 e, C#5 e | B4 e, B4 e, B4 q | A4 e, A4 e, A4 e, A4 e | C#5 h",
    "F#4 e, F#4 e, F#4 e, F#4 e | E4 e, E4 e, A4 q | B4 e, A4 e, B4 e, C#5 e | B4 h",
    "C#5 e, C#5 e, C#5 e, C#5 e | B4 e, B4 e, B4 q | A4 e, A4 e, A4 e, A4 e | C#5 h",
    "F#4 e, F#4 e, F#4 e, F#4 e | E4 e, E4 e, A4 q | B4 e, A4 e, B4 e, C#5 e | A4 h",
  ].join(" | "),
  left: [
    [
      "A2 q, C#3+E3 q | E2 q, G#3+B3 q | A2 q, C#3+E3 q | A2 q, C#3+E3 q",
      "D2 q, F#3+A3 q | A2 q, C#3+E3 q | E2 q, G#3+B3 q | E2 q, G#3+B3 q",
      "A2 q, C#3+E3 q | E2 q, G#3+B3 q | A2 q, C#3+E3 q | A2 q, C#3+E3 q",
      "D2 q, F#3+A3 q | A2 q, C#3+E3 q | E2 q, G#3+B3 q | A2+C#3+E3 h",
    ].join(" | "),
  ],
};
