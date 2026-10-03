import type { AuthoredScore } from "./notation.js";

/**
 * The opening ritornello of the chorale "Jesus bleibet meine Freude" from
 * Cantata BWV 147, after the Bach-Gesellschaft edition (vol. 30): the first
 * violin's triplet line on top, the second violin's dotted figure (played
 * against the triplets, as is customary) as an inner voice, and the continuo
 * bass with its harmony in the left hand. Bars 1-8 and the downbeat of bar 9.
 */
export const jesuJoy: AuthoredScore = {
  meter: [9, 8],
  bpm: 90,
  melody: [
    "r e, G4 e, A4 e, B4 e, D5 e, C5 e, C5 e, E5 e, D5 e",
    "D5 e, G5 e, F#5 e, G5 e, D5 e, B4 e, G4 e, A4 e, B4 e",
    "C5 e, D5 e, E5 e, D5 e, C5 e, B4 e, A4 e, B4 e, G4 e",
    "F#4 e, G4 e, A4 e, D4 e, F#4 e, A4 e, C5 e, B4 e, A4 e",
    "B4 e, G4 e, A4 e, B4 e, D5 e, C5 e, C5 e, E5 e, D5 e",
    "D5 e, G5 e, F#5 e, G5 e, D5 e, B4 e, G4 e, A4 e, B4 e",
    "E4 e, D5 e, C5 e, B4 e, A4 e, G4 e, D4 e, G4 e, F#4 e",
    "G4 e, B4 e, D5 e, G5 e, D5 e, B4 e, G4 e, B4 e, D5 e",
    "G5 h., r q.",
  ].join(" | "),
  right: [
    [
      "r q., G4 q, F#4 e, G4 q, A4 e",
      "B4 q, A4 e, B4 q, G4 e, E4 q, D4 e",
      "E4 q, F#4 e, G4 q, D4 e, E4 q, B3 e",
      "A3 q, D4 e, C4 q., F#4 q, D4 e",
      "D4 q, F#4 e, G4 q, F#4 e, G4 q, A4 e",
      "B4 q, A4 e, B4 q, G4 e, E4 q, G4 e",
      "C4 q, F#4 e, G4 q, E4 e, A3 q, C4 e",
      "B3 q, G4 e, B4 q, G4 e, D4 q, G4 e",
      "B4 h., r q.",
    ].join(" | "),
  ],
  left: [
    [
      "G2+D3 q., G3+B3 q., E3+B3 q.",
      "B2+G3 q., E3+B3 q., E2+E3 q.",
      "A2+E3 q., B2+G3 q., C3+E3 q.",
      "D3+A3 q., F#3+A3 q., D3+C4 q.",
      "G3+B3 q., E3+B3 q., C3+G3 q.",
      "B2+G3 q., E3+G3 q., D3+G3 q.",
      "C3+A3 q., C#3+G3 q., D3+A3 q.",
      "G2+D3 q., r q., D3 q, B2 e",
      "G2+D3+B3 h., r q.",
    ].join(" | "),
  ],
};
