import type { AuthoredScore } from "./notation.js";

/**
 * One verse with its fa-la-las, in F, in the form sung today (The Everyday
 * Song Book, 1927), on the usual harmony: thirds and sixths under the tune,
 * octave basses with after-beat chords, and broken chords in the middle
 * ("Don we now") phrase.
 */
export const deckTheHalls: AuthoredScore = {
  meter: [4, 4],
  bpm: 132,
  melody: [
    "C5 q., Bb4 e, A4 q, G4 q | F4 q, G4 q, A4 q, F4 q | G4 e, A4 e, Bb4 e, G4 e, A4 q., G4 e | F4 q, E4 q, F4 h",
    "C5 q., Bb4 e, A4 q, G4 q | F4 q, G4 q, A4 q, F4 q | G4 e, A4 e, Bb4 e, G4 e, A4 q., G4 e | F4 q, E4 q, F4 h",
    "G4 q., A4 e, Bb4 q, G4 q | A4 q., Bb4 e, C5 q, G4 q | A4 e, Bb4 e, C5 q, D5 e, E5 e, F5 q | E5 q, D5 q, C5 h",
    "C5 q., Bb4 e, A4 q, G4 q | F4 q, G4 q, A4 q, F4 q | D5 e, D5 e, D5 e, D5 e, C5 q., Bb4 e | A4 q, G4 q, F4 h",
  ].join(" | "),
  right: [
    [
      "F4+A4 h, F4 h | D4 w | D4 h, F4 h | C4 h, A3+C4 h",
      "F4+A4 h, F4 h | D4 w | D4 h, F4 h | C4 h, A3+C4 h",
      "E4 w | F4 h, E4 h | F4 h, F4+A4 h | G4+B4 h, E4+G4 h",
      "F4+A4 h, F4 h | D4 w | F4+Bb4 h, F4+A4 h | E4 h, A3+C4 h",
    ].join(" | "),
  ],
  left: [
    [
      "F1+F2 q, F3+A3+C4 q, C2+C3 q, F3+A3+C4 q | D2+D3 q, F3+A3 q, A1+A2 q, F3+A3 q | G1+G2 q, G3+Bb3 q, F1+F2 q, F3+A3+C4 q | C2+C3 q, E3+G3+Bb3 q, F1+F2 h",
      "F1+F2 q, F3+A3+C4 q, C2+C3 q, F3+A3+C4 q | D2+D3 q, F3+A3 q, A1+A2 q, F3+A3 q | G1+G2 q, G3+Bb3 q, F1+F2 q, F3+A3+C4 q | C2+C3 q, E3+G3+Bb3 q, F1+F2 h",
      "C3 e, G3 e, E3 e, G3 e, G2 e, G3 e, Bb3 e, G3 e | F2 e, C3 e, A3 e, C3 e, C3 e, G3 e, E3 e, G3 e | F2 e, C3 e, A3 e, C3 e, D3 e, A3 e, F3 e, A3 e | G2 e, F3 e, B3 e, F3 e, C3 e, G3 e, E3 e, G3 e",
      "F1+F2 q, F3+A3+C4 q, C2+C3 q, F3+A3+C4 q | D2+D3 q, F3+A3 q, A1+A2 q, F3+A3 q | Bb1+Bb2 q, F3+Bb3+D4 q, F1+F2 q, F3+A3+C4 q | C2+C3 q, E3+G3+Bb3 q, F2+C3+F3 h",
    ].join(" | "),
  ],
};
