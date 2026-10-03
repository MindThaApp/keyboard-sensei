import type { AuthoredScore } from "./notation.js";

/**
 * The traditional tune, one chorus, as given in the German Wikipedia article
 * and in the abcnotation.com collections (C major there, G in others), an
 * octave up, with a march bass (root, chord, fifth, chord) and the usual
 * harmony: C, G7 on "marching in", C7 to F on "number", F-G7-C at the close.
 */
export const whenTheSaintsGoMarchingIn: AuthoredScore = {
  meter: [4, 4],
  bpm: 120,
  pickupBeats: 3,
  melody: [
    "C5 q, E5 q, F5 q",
    "G5 w | r q, C5 q, E5 q, F5 q | G5 w | r q, C5 q, E5 q, F5 q",
    "G5 h, E5 h | C5 h, E5 h | D5 w | r q, E5 q, E5 q, D5 q",
    "C5 w | E5 h, G5 h | G5 q, F5 h. | r h, E5 q, F5 q",
    "G5 h, E5 h | C5 h, D5 h | C5 w",
  ].join(" | "),
  right: [
    [
      "r h.",
      "C5+E5 w | r q, G4 q, C5 q, C5 q | C5+E5 w | r q, G4 q, C5 q, C5 q",
      "C5+E5 h, G4+C5 h | E4+G4 h, G4+C5 h | F4+B4 w | r q, B4 q, B4 q, F4+B4 q",
      "E4+G4 w | C5 h, Bb4+E5 h | Bb4+E5 q, A4+C5 h. | A4+C5 h, G4+C5 q, A4+C5 q",
      "C5+E5 h, G4+C5 h | F4+A4 h, F4+B4 h | E4+G4 w",
    ].join(" | "),
  ],
  left: [
    [
      "r h, G2 q",
      "C2+C3 q, G3+C4+E4 q, G1+G2 q, G3+C4+E4 q | C2+C3 q, G3+C4+E4 q, G1+G2 q, G3+C4+E4 q | C2+C3 q, G3+C4+E4 q, G1+G2 q, G3+C4+E4 q | C2+C3 q, G3+C4+E4 q, G1+G2 q, G3+C4+E4 q",
      "C2+C3 q, G3+C4+E4 q, G1+G2 q, G3+C4+E4 q | C2+C3 q, G3+C4+E4 q, E2+E3 q, G3+C4+E4 q | G1+G2 q, G3+B3+D4 q, D2+D3 q, G3+B3+D4 q | G1+G2 q, F3+B3+D4 q, D2+D3 q, F3+B3+D4 q",
      "C2+C3 q, G3+C4+E4 q, G1+G2 q, G3+C4+E4 q | C2+C3 q, G3+C4+E4 q, C2+C3 q, G3+Bb3+E4 q | F1+F2 q, A3+C4+F4 q, C2+C3 q, A3+C4+F4 q | F1+F2 q, A3+C4+F4 q, C2+C3 q, A3+C4+F4 q",
      "C2+C3 q, G3+C4+E4 q, G1+G2 q, G3+C4+E4 q | F1+F2 q, A3+C4 q, G1+G2 q, F3+B3 q | C2+C3 q, G3+C4 q, C2+G2+C3 h",
    ].join(" | "),
  ],
};
