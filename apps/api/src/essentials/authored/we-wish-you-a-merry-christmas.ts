import type { AuthoredScore } from "./notation.js";

/**
 * Verse and "Good tidings" refrain in G, as in the common folk-song
 * transcriptions, on the usual harmony of the carol: an alto line under the
 * tune, octave basses and waltz chords in the left hand.
 */
export const weWishYouAMerryChristmas: AuthoredScore = {
  meter: [3, 4],
  bpm: 144,
  pickupBeats: 1,
  melody: [
    "D4 q",
    "G4 q, G4 e, A4 e, G4 e, F#4 e | E4 q, E4 q, E4 q | A4 q, A4 e, B4 e, A4 e, G4 e | F#4 q, D4 q, D4 q",
    "B4 q, B4 e, C5 e, B4 e, A4 e | G4 q, E4 q, D4 e, D4 e | E4 q, A4 q, F#4 q | G4 h, D4 q",
    "G4 q, G4 q, G4 q | F#4 h, F#4 q | G4 q, F#4 q, E4 q | D4 h, A4 q",
    "B4 q, A4 e, A4 e, G4 e, G4 e | D5 q, D4 q, D4 e, D4 e | E4 q, A4 q, F#4 q | G4 h",
  ].join(" | "),
  right: [
    [
      "r q",
      "D4 h. | C4 h. | C#4+E4 h. | r h.",
      "D#4+F#4 h. | B3+E4 q, r h | C4 q, C4+E4 q, C4 q | B3+D4 h, r q",
      "B3+D4 h. | D4 h. | C#4 h. | r h, C4+F#4 q",
      "D4 h. | F#4+A4 q, r h | C4 q, C4+E4 q, C4 q | B3+D4 h",
    ].join(" | "),
  ],
  left: [
    [
      "r q",
      "G1+G2 q, D3+G3 q, D3+G3 q | C2+C3 q, E3+G3 q, E3+G3 q | A1+A2 q, E3+G3 q, E3+G3 q | D2+D3 q, F#3+A3 q, F#3+A3 q",
      "B1+B2 q, D#3+F#3+A3 q, D#3+F#3+A3 q | E2+E3 q, G3+B3 q, G3+B3 q | A1+A2 q, E3+A3 q, D3+F#3 q | G1+G2 q, D3+G3 q, D3+G3 q",
      "G1+G2 q, D3+G3 q, D3+G3 q | D2+D3 q, F#3+A3 q, F#3+A3 q | A1+A2 q, E3+G3 q, E3+G3 q | D2+D3 q, F#3+A3+C4 q, F#3+A3 q",
      "G1+G2 q, D3+G3+B3 q, D3+G3+B3 q | D2+D3 q, F#3+A3 q, F#3+A3 q | A1+A2 q, E3+A3 q, D3+F#3 q | G1+G2 h",
    ].join(" | "),
  ],
};
