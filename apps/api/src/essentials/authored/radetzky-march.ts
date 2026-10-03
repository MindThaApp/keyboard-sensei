import type { AuthoredScore } from "./notation.js";

/**
 * The first strain of the march (from the upbeat after the introduction to
 * the double bar), with the tune, bass and chords of Haslinger's 1848 piano
 * first edition, which is barred in common time; grace notes are left out.
 */
const MOTIF = "A4+D5 e, r e, r q, A4+D5 e, r e, r q";

export const radetzkyMarch: AuthoredScore = {
  meter: [4, 4],
  bpm: 116,
  pickupBeats: 1,
  melody: [
    "F#5 e, E#5 e",
    "F#5 e, r e, F#5 e, E#5 e, F#5 e, r e, F#5 e, E#5 e",
    "F#5 e, r e, E5 e, r e, D5 e, r e, F#5 e, E#5 e",
    "F#5 e, r e, F#5 e, E#5 e, F#5 e, r e, F#5 e, E#5 e",
    "F#5 e, r e, B5 e, r e, A5 e, r e, A5 e, F#5 e",
    "G5 e, r e, B5 e, r e, A5 e, r e, A5 e, E5 e",
    "F#5 e, r e, B5 e, r e, A5 e, r e, A5 e, F#5 e",
    "E5 e, r e, C#6 q, D5 e, r e, B5 q",
    "C#5 e, r e, A5 e, G#5 e, A5 e, B5 e, A5 e, G5 e",
    "F#5 e, r e, F#5 e, E#5 e, F#5 e, r e, F#5 e, E#5 e",
    "F#5 e, r e, E5 e, r e, D5 e, r e, F#5 e, E#5 e",
    "F#5 e, r e, F#5 e, E#5 e, F#5 e, r e, F#5 e, E#5 e",
    "F#5 e, r e, B5 e, r e, A5 e, r e, A5 e, F#5 e",
    "G#5 e, r e, F#6 e, r e, E6 h",
    "r q, E6 e, r e, D6 h",
    "C#6 q., B5 e, A5 e, G5 e, F#5 e, E5 e",
    "D5 q, D5 q, D5 q",
  ].join(" | "),
  right: [
    [
      "r q",
      MOTIF,
      "A4+D5 e, r e, A4+C#5 e, r e, F#4+A4 e, r e, r q",
      MOTIF,
      "A4+D5 e, r e, D5 e, r e, D5 e, r e, r q",
      "A4+C#5 e, r e, C#5 e, r e, C#5 e, r e, r q",
      "A4+D5 e, r e, D5 e, r e, D5 e, r e, r q",
      "r q, A4+E5 q, r q, G#4+D5 q",
      "r q, C#5+E5 h, r q",
      MOTIF,
      "A4+D5 e, r e, A4+C#5 e, r e, F#4+A4 e, r e, r q",
      MOTIF,
      "A4+D5 e, r e, D5 e, r e, D5 e, r e, r q",
      "r q, F#5 e, r e, G#4+E5 h",
      "r q, G4+C#5 e, r e, G4+A4 h",
      "A4+E5 q., r e, G4+C#5 h",
      "r q, F#4+A4 q, F#4+A4 q",
    ].join(" | "),
  ],
  left: [
    [
      "r q",
      "D3 q, F#3+A3+D4 q, D3 q, F#3+A3+D4 q",
      "D3 q, F#3+A3+D4 q, D3 q, F#3+A3+D4 q",
      "D3 q, F#3+A3+D4 q, D3 q, F#3+A3+D4 q",
      "D3 q, F#3+A3+D4 q, D3 q, F#3+A3+D4 q",
      "A2 q, G3+C#4+E4 q, A2 q, G3+C#4+E4 q",
      "D3 q, F#3+A3+D4 q, D3 q, F#3+A3+D4 q",
      "E3+A3+C#4 q, r q, E3+G#3+B3+D4 q, r q",
      "A2+E3+A3+C#4 q, r q, A2+E3+G3+C#4 h",
      "D3 q, F#3+A3+D4 q, A2 q, F#3+A3+D4 q",
      "D3 q, F#3+A3+D4 q, A2 q, F#3+A3+D4 q",
      "D3 q, F#3+A3+D4 q, A2 q, F#3+A3+D4 q",
      "D3 q, F#3+A3+D4 q, A2 q, F#3+A3+D4 q",
      "E3+G#3+B3+D4 h, r q, A2+C#3+E3+G3 q",
      "A2+E3+G3+C#4 h, r q, G3+A3+C#4+E4 q",
      "E2 q, G3+C#4+E4 q, A2 q, G3+A3+C#4 q",
      "D3+F#3+A3+D4 q, D3+F#3+A3+D4 q, D3+F#3+A3+D4 q",
    ].join(" | "),
  ],
};
