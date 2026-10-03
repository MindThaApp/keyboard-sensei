import type { AuthoredScore } from "./notation.js";

/**
 * One verse and the "tidings of comfort and joy" refrain in E minor, after
 * the traditional harmony printed in Stainer and Bramley's "Christmas Carols
 * New and Old" (1871): the alto under the tune in the right hand, tenor and
 * bass in the left (a tenor note dropped an octave where the hand would
 * stretch past a tenth, and doubled notes left to one voice).
 */
export const godRestYeMerryGentlemen: AuthoredScore = {
  meter: [4, 4],
  bpm: 120,
  pickupBeats: 1,
  melody: [
    "E4 q",
    "E4 q, B4 q, B4 q, A4 q | G4 q, F#4 q, E4 q, D4 q | E4 q, F#4 q, G4 q, A4 q | B4 h., E4 q",
    "E4 q, B4 q, B4 q, A4 q | G4 q, F#4 q, E4 q, D4 q | E4 q, F#4 q, G4 q, A4 q | B4 h, r q, B4 q",
    "C5 q, A4 q, B4 q, C5 q | D5 q, E5 q, B4 q, A4 q | G4 q, E4 q, F#4 q, G4 q | A4 h, G4 q, A4 q",
    "B4 h, C5 q, B4 q | B4 q, A4 q, G4 q, F#4 q | E4 h, G4 e, F#4 e, E4 q | A4 h, G4 q, A4 q",
    "B4 q, C5 q, D5 q, E5 q | B4 q, A4 q, G4 q, F#4 q | E4 h.",
  ].join(" | "),
  right: [
    [
      "r q",
      "r q, G4 q, F#4 q, D#4 q | E4 q, D4 q, C4 q, B3 q | r q, D#4 q, E4 q, E4 q | D#4 h., r q",
      "r q, G4 q, F#4 q, D#4 q | E4 q, D4 q, C4 q, B3 q | r q, D#4 q, E4 q, E4 q | D#4 h, r q, E4 q",
      "E4 q, D4 q, D4 q, G4 q | F4 q, E4 q, D4 q, D#4 q | E4 q, C#4 q, D4 q, r q | F#4 h, D4 h",
      "D4 h, E4 q, D4 q | G4 q, F#4 q, E4 q, D#4 q | B3 h, B3 e, B3 e, C#4 q | D4 h, E4 q, F#4 q",
      "G4 h, G4 q, G4 q | G4 q, F#4 q, E4 q, D#4 q | B3 h.",
    ].join(" | "),
  ],
  left: [
    [
      "r q",
      "G3 q, r q, F#3 q, B3 q | B3 q, B3 q, G3 q, G3 q | G3 q, B3 q, B3 q, E3 q | F#3 h., r q",
      "G3 q, r q, F#3 q, B3 q | B3 q, B3 q, G3 q, G3 q | G3 q, B3 q, B3 q, E3 q | F#3 h, r q, G#3 q",
      "r q, A3 q, r q, G3 q | G3 q, G3 q, G3 q, F#3 q | G3 q, G3 q, A3 q, D4 q | D4 q, C4 q, B3 q, A3 q",
      "G3 h, G3 q, G3 q | D3 q, C4 q, B3 q, B3 q | G3 h, G3 e, G3 e, G3 q | F#3 q, A3 q, D4 q, C4 q",
      "B3 q, G3 q, D4 q, C4 q | D3 q, C4 q, B3 q, B3 q | G3 h.",
    ].join(" | "),
    [
      "E3 q",
      "E3 q, E3 q, D#3 q, B2 q | E3 q, B2 q, C3 q, G2 q | C3 q, B2 q, E3 q, C3 q | B2 h., E3 q",
      "E3 q, E3 q, D#3 q, B2 q | E3 q, B2 q, C3 q, G2 q | C3 q, B2 q, E3 q, C3 q | B2 h, r q, E3 q",
      "A3 q, F#3 q, G3 q, C3 q | B2 q, C3 q, G2 q, B2 q | E3 q, E3 q, D3 q, B2 q | D3 h, E3 q, F#3 q",
      "G2 h, C3 q, G2 q | G2 q, A2 q, B2 q, B2 q | E3 h, E3 e, E3 e, E3 q | D3 q, C3 q, B2 q, A2 q",
      "G2 q, E3 q, B2 q, C3 q | G2 q, A2 q, B2 q, B2 q | E2+E3 h.",
    ].join(" | "),
  ],
};
