import type { AuthoredScore } from "./notation.js";

/**
 * The opening of the Bridal Chorus ("Treulich geführt ... zum seligsten
 * Paar", the sixteen bars after the four-bar fanfare), the sopranos' line on
 * top, with the harmony of the Breitkopf & Härtel vocal score's piano
 * reduction: inner chord tones in the right hand, and a bass line under
 * close chords in the left.
 */
const opening = {
  melody: "F4 q, Bb4 e., Bb4 s | Bb4 q., r e | F4 q, C5 e., A4 s | Bb4 q., r e",
  right: "D4 q, D4+F4 e., D4+F4 s | D4+F4 q., r e | D4 q, Eb4+A4 e., Eb4 s | D4+F4 q., r e",
  bass: "Bb2 h | Bb2 q., r e | Bb2 q, F2 q | Bb2 q., r e",
  chords: "D3+F3 q, D3+F3 e., D3+F3 s | D3+F3 q., r e | D3+F3 q, Eb3+A3 e., Eb3+A3 s | D3+F3 q., r e",
};

export const bridalChorus: AuthoredScore = {
  meter: [2, 4],
  bpm: 76,
  melody: [
    opening.melody,
    "F4 q, Bb4 e., Eb5 s | Eb5 q, D5 e, r s, C5 s | Bb4 q, A4 e., Bb4 s | C5 q., r e",
    opening.melody,
    "F4 q, Bb4 e., D5 s | F5 q, D5 e., Bb4 s | G4 q, C5 e., D5 s | Bb4 q., r e",
  ].join(" | "),
  right: [
    [
      opening.right,
      "D4 q, D4+F4 e., G4+Bb4 s | G4+Bb4 q, F4+Bb4 e, r s, F4+A4 s | F4 q, E4 e., E4 s | F4+A4 q., r e",
      opening.right,
      "D4 h | F4+A4 q, G4 q | Eb4 q, F4+A4 q | D4+F4 q., r e",
    ].join(" | "),
  ],
  left: [
    [
      opening.bass,
      "Bb2 h | Bb2 q, F2 q | D3 q, C3 q | F2 q., r e",
      opening.bass,
      "Bb2 h | D3 q, G2 q | Eb2 q, F2 q | Bb2 q., r e",
    ].join(" | "),
    [
      opening.chords,
      "D3+F3 q, D3+F3 e., Eb3+G3 s | Eb3+G3 q, D3+F3 e, r s, Eb3+A3 s | F3+Bb3 q, E3+Bb3 e., E3+Bb3 s | F3+A3 q., r e",
      opening.chords,
      "D3+F3 h | F3+A3 q, D3+Bb3 q | G3+C4 q, A3+Eb4 q | D3+F3 q., r e",
    ].join(" | "),
  ],
};
