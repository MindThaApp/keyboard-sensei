import type { AuthoredScore } from "./notation.js";

/**
 * The air (words by Sir Harold Boulton, 1884, to a Gaelic rowing tune noted by Anne MacLeod) as transcribed in John Chambers' ABC collection and on The Session (tune 3690), checked against the
 * Wikipedia score. Twelve bars: the first strain, the second strain, then the first strain with its closing ending. The left hand is simple chords.
 */
export const skyeBoatSong: AuthoredScore = {
  meter: [6, 8],
  bpm: 80,
  melody: [
    "D4 e., E4 s, D4 e, G4 q, G4 e | A4 e., B4 s, A4 e, D5 q. | B4 e., A4 s, B4 e, E4 q, E4 e | D4 h.",
    "B4 e., G4 s, B4 e, B4 q. | A4 e., E4 s, A4 e, A4 q. | G4 e., E4 s, G4 e, G4 q, G4 e | E4 h.",
    "D4 e., E4 s, D4 e, G4 q, G4 e | A4 e., B4 s, A4 e, D5 q. | B4 e., A4 s, B4 e, E4 q, F#4 e | G4 h.",
  ].join(" | "),
  left: [
    [
      "G2 q., B3+D4 q. | A2+E3+C4 q., D2+F#3+C4 q. | G2+B3+D4 q., C3+E3+G3 q. | G2+B3+D4 q., D2+F#3+C4 q.",
      "E2 q., G3+B3 q. | A2 q., E3+C4 q. | E2+G3+B3 q., A2+E3+C4 q. | E2 q., G3+B3 q.",
      "G2 q., B3+D4 q. | A2+E3+C4 q., D2+F#3+C4 q. | G2+B3+D4 q., D2+F#3+C4 q. | G2+B3+D4 h.",
    ].join(" | "),
  ],
};
