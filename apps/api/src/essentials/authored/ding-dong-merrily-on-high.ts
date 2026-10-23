import type { AuthoredScore } from "./notation.js";

/**
 * The tune as transcribed in The Session (setting 27786): verse and refrain. The left hand is simple chords.
 */
export const dingDongMerrilyOnHigh: AuthoredScore = {
  meter: [4, 4],
  bpm: 112,
  melody: [
    "D5 q, D5 q, E5 e, D5 e, C#5 e, B4 e | A4 h., A4 q | B4 q, D5 q, D5 q, C#5 q | D5 h, D5 h",
    "D5 q, D5 q, E5 e, D5 e, C#5 e, B4 e | A4 h., A4 q | B4 q, D5 q, D5 q, C#5 q | D5 h, D5 h",
    "A5 q., G5 e, F#5 e, G5 e, A5 e, F#5 e | G5 q., F#5 e, E5 e, F#5 e, G5 e, E5 e | F#5 q., E5 e, D5 e, E5 e, F#5 e, D5 e | E5 q., D5 e, C#5 e, D5 e, E5 e, C#5 e",
    "D5 q., C#5 e, B4 e, C#5 e, D5 e, B4 e | C#5 q., B4 e, A4 q, A4 q | B4 q, D5 q, D5 q, C#5 q | D5 h, D5 h",
  ].join(" | "),
  left: [
    [
      "D2 q, F#3+A3 q, E2 q, G#3+D4 q | A2 q, C#3+E3 q, E2 q, C#3+E3 q | G2 q, B3+D4 q, A2 q, C#3+E3 q | D2 q, F#3+A3 q, A2 q, F#3+A3 q",
      "D2 q, F#3+A3 q, E2 q, G#3+D4 q | A2 q, C#3+E3 q, E2 q, C#3+E3 q | G2 q, B3+D4 q, A2 q, C#3+E3 q | D2 q, F#3+A3 q, A2 q, F#3+A3 q",
      "D2 q, F#3+A3 q, A2 q, F#3+A3 q | E2 q, G3+B3 q, B2 q, G3+B3 q | D2 q, F#3+A3 q, A2 q, F#3+A3 q | A2 q, C#3+E3 q, E2 q, C#3+E3 q",
      "B2 q, D3+F#3 q, F#2 q, D3+F#3 q | A2 q, C#3+E3 q, E2 q, C#3+E3 q | G2 q, B3+D4 q, A2 q, C#3+E3 q | D2+F#3+A3 w",
    ].join(" | "),
  ],
};
