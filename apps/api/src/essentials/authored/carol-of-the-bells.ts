import type { AuthoredScore } from "./notation.js";

/**
 * Leontovych's Shchedryk (the tune behind "Carol of the Bells") in his key
 * of G minor: the solo bar, the whole verse (bars 2–32) and the closing bars
 * of the second ending. The tune is the soprano line; the left hand takes the
 * choir's descending lines, its G pedal and, in the middle, the ostinato that
 * Leontovych hands to the basses and tenors.
 */
const bars = (text: string, times: number): string => Array(times).fill(text).join(" | ");

const OSTINATO = "Bb4 q, A4 e, Bb4 e, G4 q";
const REST = "r h.";

export const carolOfTheBells: AuthoredScore = {
  meter: [3, 4],
  bpm: 160,
  melody: [
    bars(OSTINATO, 16),
    bars("D5 q, C5 e, D5 e, Bb4 q", 4),
    "G5 q, G5 e, G5 e, F5 e, Eb5 e | D5 q, D5 e, D5 e, C5 e, Bb4 e | C5 q, C5 e, C5 e, D5 e, C5 e | G4 q, G4 e, G4 e, G4 q",
    "D4 e, E4 e, F#4 e, G4 e, A4 e, Bb4 e | C5 e, D5 e, C5 q, Bb4 q",
    "D4 e, E4 e, F#4 e, G4 e, A4 e, Bb4 e | C5 e, D5 e, C5 q, Bb4 q",
    bars(OSTINATO, 4),
    "G4 h.~ | G4 h.~ | G4 h. | D5 q, C5 e, D5 e, G4 q",
  ].join(" | "),
  right: [
    [
      bars(REST, 16),
      bars(OSTINATO, 4),
      bars("G4 q, G4 e, G4 e, G4 q", 3),
      "D4 q, D4 e, D4 e, D4 q",
      "r h. | E4 q, F#4 q, G4 q | r h. | E4 q, F#4 q, G4 q",
      "D4 h. | C4 h. | F4 h. | Eb4 h.",
      "D4 h.~ | D4 h.~ | D4 h. | r h.",
    ].join(" | "),
  ],
  left: [
    [
      bars(REST, 4),
      "G3 h. | F3 h. | Eb3 h. | D3 h.",
      "Eb3+G3 h. | Bb2+F3 h. | C3+Eb3 h. | G2+D3 h.",
      "Eb3+G3+C4 q, Eb3+G3+C4 e, Eb3+G3+C4 e, Eb3+G3+C4 q",
      "G2+D3+G3 q, G2+D3+G3 e, G2+D3+G3 e, G2+D3+G3 q",
      "C3+G3+Eb4 q, C3+G3+Eb4 e, C3+G3+Eb4 e, C3+G3+Eb4 q",
      bars("G2+D3+G3 q, G2+D3+G3 e, G2+D3+G3 e, G2+D3+G3 q", 5),
      bars("Bb2+Bb3 q, A2+A3 e, Bb2+Bb3 e, G2+G3 q", 4),
      bars("Bb3 q, A3 e, Bb3 e, G3 q", 4),
      "G2+G3 h.~ | G2+G3 h.~ | G2+G3 h.~ | G2+G3 h.",
      bars("Bb3 q, A3 e, Bb3 e, G3 q", 3),
      "r h, G2+G3 q",
    ].join(" | "),
    [
      bars(REST, 24),
      "D3 h. | D3 h. | D3 h.~ | D3 h, Eb3 q",
      bars(REST, 4),
      "G2 h.~ | G2 h.~ | G2 h. | r h.",
    ].join(" | "),
  ],
};
