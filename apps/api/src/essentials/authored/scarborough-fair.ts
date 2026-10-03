import type { AuthoredScore } from "./notation.js";

/**
 * The traditional Dorian tune (the Middleton-in-Teesdale version), one verse,
 * as given in the Wikipedia "version commonly used today" and the folk
 * collections on thesession.org and abcnotation.com (sung there in E Dorian),
 * here in D Dorian an octave up, with a flowing broken-chord accompaniment.
 */
export const scarboroughFair: AuthoredScore = {
  meter: [3, 4],
  bpm: 108,
  melody: [
    "D5 h, D5 q | A5 q, A5 q, A5 q | E5 q., F5 e, E5 q | D5 h.",
    "r q, A5 q, C6 q | D6 h, C6 q | A5 q, B5 q, G5 q | A5 h.~",
    "A5 h, D6 q | D6 h, D6 q | C6 h, A5 q | A5 q, G5 q, F5 q | E5 q, C5 h~ | C5 h.",
    "D5 h, A5 q | G5 h, F5 q | E5 q, D5 q, C5 q | D5 h.~ | D5 h.",
  ].join(" | "),
  right: [
    [
      "r h. | r h. | r h. | A4 h.",
      "r q, F5 q, A5 q | F5 h, E5 q | D5 q, D5 q, B4 q | F5 h.",
      "F5 h, A5 q | A5 h, F5 q | A5 h, F5 q | F5 q, E5 q, D5 q | C5 q, G4 h | G4 h.",
      "r h. | E5 h, C5 q | C5 q, B4 q, A4 q | A4 h. | F4+A4 h.",
    ].join(" | "),
  ],
  left: [
    [
      "D3 e, A3 e, D4 e, F4 e, D4 e, A3 e | D3 e, A3 e, D4 e, F4 e, D4 e, A3 e | C3 e, G3 e, C4 e, E4 e, C4 e, G3 e | D3 e, A3 e, D4 e, F4 e, D4 e, A3 e",
      "F2 e, C3 e, F3 e, A3 e, F3 e, C3 e | D3 e, A3 e, D4 e, F4 e, D4 e, A3 e | G2 e, D3 e, G3 e, B3 e, G3 e, D3 e | D3 e, A3 e, D4 e, F4 e, D4 e, A3 e",
      "D3 e, A3 e, D4 e, F4 e, D4 e, A3 e | D3 e, A3 e, D4 e, F4 e, D4 e, A3 e | F2 e, C3 e, F3 e, A3 e, F3 e, C3 e | F2 e, C3 e, F3 e, A3 e, F3 e, C3 e | C3 e, G3 e, C4 e, E4 e, C4 e, G3 e | C3 e, G3 e, C4 e, E4 e, C4 e, G3 e",
      "D3 e, A3 e, D4 e, F4 e, D4 e, A3 e | C3 e, G3 e, C4 e, E4 e, C4 e, G3 e | C3 e, G3 e, C4 e, E4 e, C4 e, G3 e | D3 e, A3 e, D4 e, F4 e, D4 e, A3 e | D2+A2+D3 h.",
    ].join(" | "),
  ],
};
