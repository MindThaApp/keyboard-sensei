import type { AuthoredScore } from "./notation.js";

/**
 * The song as transcribed in the Essen Folksong Collection (E0785), one verse. The left hand is simple chords.
 */
export const mussIDenn: AuthoredScore = {
  meter: [2, 4],
  bpm: 100,
  pickupBeats: 0.5,
  melody: [
    "F4 s, G4 s | A4 e, A4 s, C5 s, A#4 e, A#4 s, D5 s | C5 e, C5 s, A#4 s, A4 q | C5 e, C5 s, A#4 s, A4 e, A4 s, C5 s",
    "A#4 e, A#4 e, G4 e, C5 e | A4 q, r e, F4 s, G4 s | A4 e, A4 s, C5 s, A#4 e, A#4 s, D5 s | C5 e, C5 s, A#4 s, A4 q",
    "C5 e, C5 s, A#4 s, A4 e, A4 s, C5 s | A#4 e, A#4 e, G4 e, C5 e | A4 q, r e, F4 s, A4 s | G4 e., A4 s, A#4 e, G4 e",
    "A4 e., A#4 s, C5 e, C5 s, C5 s | D5 e, D5 e, F5 e, E5 s, D5 s | C5 q, r e, F4 s, A4 s | C5 e, C5 s, D5 s, C5 e, C5 s, F5 s",
    "C5 e, C5 s, A#4 s, A4 q | C5 e, C5 s, A#4 s, A4 e, A4 s, C5 s | A#4 e, A#4 e, G4 e, C5 e | A4 q, r e",
  ].join(" | "),
  left: [
    [
      "r e | F2 q, A#2 q | C3 q, F2 q | F2 q, A3+C4 q",
      "A#2 q, C3 q | F2 q, A3+C4 q | F2 q, A#2 q | C3 q, F2 q",
      "F2 q, A3+C4 q | A#2 q, C3 q | F2 q, A3+C4 q | C3 q, E3+A#3 q",
      "F2 q, A3+C4 q | A#2 q, D3+F3 q | F2 q, A3+C4 q | F2 q, A3+C4 q",
      "C3 q, F2 q | F2 q, A3+C4 q | A#2 q, C3 q | F2+A3+C4 q.",
    ].join(" | "),
  ],
};
