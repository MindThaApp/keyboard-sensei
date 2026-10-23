import type { AuthoredScore } from "./notation.js";

/**
 * The tune as transcribed in The Session (setting 10534), both strains. The left hand is simple chords.
 */
export const popGoesTheWeasel: AuthoredScore = {
  meter: [6, 8],
  bpm: 126,
  pickupBeats: 0.5,
  melody: [
    "D4 e | G4 q, G4 e, A4 q, A4 e | B4 e, D5 e, B4 e, G4 q, D4 e | G4 q, G4 e, A4 q, C5 e",
    "B4 q., G4 q, D4 e | G4 q, G4 e, A4 q, A4 e | B4 e, D5 e, B4 e, G4 q. | E5 q, r e, A4 q, C5 e",
    "B4 q., G4 q, D5 e | G5 q, F#5 e, E5 q, G5 e | F#5 e, A5 e, F#5 e, D5 q, F#5 e | G5 q, F#5 e, E5 e, F#5 e, G5 e",
    "F#5 q., D5 q, B4 e | C5 q, B4 e, C5 q, D5 e | E5 q, F#5 e, G5 q. | E5 q, r e, A4 q, C5 e",
    "B4 q., G4 q",
  ].join(" | "),
  left: [
    [
      "r e | G2 q., B3+D4 q. | G2 q., B3+D4 q. | G2+B3+D4 q., A2+C3+E3 q.",
      "G2 q., B3+D4 q. | G2 q., B3+D4 q. | G2 q., B3+D4 q. | C3+E3+G3 q., D2+F#3+C4 q.",
      "G2 q., B3+D4 q. | G2 q., B3+D4 q. | D2 q., F#3+A3 q. | G2 q., B3+D4 q.",
      "D2 q., F#3+A3 q. | C3 q., E3+G3 q. | C3 q., E3+G3 q. | A2 q., C3+E3 q.",
      "G2+B3+D4 h~, G2+B3+D4 e",
    ].join(" | "),
  ],
};
