import type { AuthoredScore } from "./notation.js";

/**
 * The Neapolitan boat song (Teodoro Cottrau, 1849) as printed in The Everyday Song Book (1927, no. 144), checked against John Chambers' ABC transcription. Verse and refrain, with the first ending. The left hand is simple chords.
 */
export const santaLucia: AuthoredScore = {
  meter: [3, 4],
  bpm: 84,
  melody: [
    "G4 q, G4 q., C5 e | C5 e, B4 e, B4 h | F4 q, F4 q., A4 e | A4 e, G4 e, G4 h",
    "E4 q, A4 q, G4 q | G4 e, F#4 e, F4 h | F4 q, E4 q, D4 q | A4 q, G4 h",
    "E5 q, D5 q, C5 q | B4 e, A4 e, D5 h | D5 q, C5 q, A4 q | F#4 e, G4 e, C5 h",
    "E5 e, C5 e, C5 e, G4 e, G4 e, E4 e | F4 e, D5 e, D5 h | D5 q, A4 q., B4 e | D5 q, C5 h",
  ].join(" | "),
  left: [
    [
      "C3 q, E3+G3 q, E3+G3 q | G2 q, F3+B3 q, F3+B3 q | F2 q, A3+C4 q, A3+C4 q | C3 q, E3+G3 q, E3+G3 q",
      "A2 q, C#3+G3 q, C#3+G3 q | D3 q, F3+A3 q, F3+A3 q | G2 q, F3+B3 q, F3+B3 q | C3 q, E3+G3 q, E3+G3 q",
      "C3 q, E3+G3 q, E3+G3 q | D3 q, F3+A3 q, F3+A3 q | F2 q, A3+C4 q, A3+C4 q | C3 q, E3+G3 q, E3+G3 q",
      "C3 q, E3+G3 q, E3+G3 q | D3 q, F3+A3 q, F3+A3 q | G2 q, F3+B3 q, F3+B3 q | C3+E3+G3 h.",
    ].join(" | "),
  ],
};
