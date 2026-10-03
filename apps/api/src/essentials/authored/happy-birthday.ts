import type { AuthoredScore } from "./notation.js";

/**
 * The Hills' tune as sung to the birthday words, in G with the dotted
 * "Hap-py" upbeat, played twice. Harmony after the four-part setting in The
 * Golden Book of Favorite Songs (1915): an alto line under the tune, octave
 * basses and waltz chords the first time, broken-chord left hand the second,
 * and a two-bar IV–I tag to close.
 */
export const happyBirthday: AuthoredScore = {
  meter: [3, 4],
  bpm: 96,
  pickupBeats: 1,
  melody: [
    "D4 e., D4 s",
    // First time
    "E4 q, D4 q, G4 q | F#4 h, D4 e., D4 s | E4 q, D4 q, A4 q | G4 h, D4 e., D4 s",
    "D5 q, B4 q, G4 q | F#4 q, E4 q, C5 e., C5 s | B4 q, G4 q, A4 q | G4 h, D4 e., D4 s",
    // Second time
    "E4 q, D4 q, G4 q | F#4 h, D4 e., D4 s | E4 q, D4 q, A4 q | G4 h, D4 e., D4 s",
    "D5 q, B4 q, G4 q | F#4 q, E4 q, C5 e., C5 s | B4 q, G4 q, A4 q | G4 h.",
    // Tag
    "r h. | r h",
  ].join(" | "),
  right: [
    [
      "r q",
      "B3 q, B3 q, D4 q | C4 h, r q | C4 h, F#4 q | D4 h, B3 q",
      "G4+B4 q, D4+G4 q, D4 q | D4 q, B3 q, E4+G4 q | D4+G4 q, D4 q, C4+F#4 q | B3+D4 h, r q",
      "B3 q, B3 q, B3+D4 q | A3+C4 h, r q | A3+C4 h, C4+F#4 q | B3+D4 h, B3 q",
      "G4+B4 q, D4+G4 q, B3+D4 q | B3+D4 q, B3 q, E4+G4 q | D4+G4 q, B3+D4 q, C4+F#4 q | B3+D4 h.",
      "E4+G4+C5 h. | D4+G4+B4 h",
    ].join(" | "),
  ],
  left: [
    [
      "r q",
      "G1+G2 q, D3+G3 q, D3+G3 q | D2+D3 q, F#3+A3 q, F#3+A3 q | D2+D3 q, F#3+A3 q, F#3+A3 q | G1+G2 q, D3+G3 q, D3+G3 q",
      "G1+G2 q, D3+G3 q, D3+G3 q | B1+B2 q, D3+G3 q, C2+C3 q | D2+D3 q, G3+B3 q, D2+D3 q | G1+G2 h, D3+G3 q",
      "G1+G2 q, D3 e, G3 e, D3 e, G3 e | D2+D3 q, A2 e, D3 e, F#3 e, D3 e | D2+D3 q, A2 e, D3 e, F#3 e, D3 e | G1+G2 q, D3 e, G3 e, D3 e, G3 e",
      "G1+G2 q, D3 e, G3 e, D3 e, G3 e | B1+B2 q, D3 e, G3 e, C2+C3 e, G2 e | D2+D3 q, G2 e, G3 e, D2+D3 e, A2 e | G1+G2 q, D3 e, G3 e, D3 e, G3 e",
      "C2+C3 q, E3 e, G3 e, E3 e, G3 e | G1+G2 h",
    ].join(" | "),
  ],
};
