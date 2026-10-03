import type { AuthoredScore } from "./notation.js";

/**
 * The tune as printed by R. R. Terry (The Shanty Book, 1921), with his
 * alternating 4/4 and 3/4 bars and note values and his last-verse ending,
 * checked against Joanna Colcord (Roll and Go, 1924); one verse, in
 * Colcord's key of D and an octave up. The harmony follows Terry's piano part
 * (I, IV over a tonic pedal, IV-V, vi, I6/4-V7, vi-IV, V-I).
 */
export const shenandoah: AuthoredScore = {
  meter: [4, 4],
  bpm: 60,
  pickupBeats: 1,
  meterChanges: [
    { bar: 3, meter: [3, 4] },
    { bar: 6, meter: [4, 4] },
    { bar: 7, meter: [3, 4] },
  ],
  melody: [
    "A4 q",
    "D5 e, D5 e, D5 q., E5 e, F#5 e, G5 e | B5 e, A5 q., D6 e, C#6 e | B5 q., A5 e, B5 e, A5 e | F#5 e, A5 q., A5 q",
    "B5 e, B5 e, B5 q., F#5 e, A5 e, F#5 e | E5 e, D5 q., E5 q | F#5 q., D5 e, F#5 e., B5 s | A5 h.",
    "D5 e., E5 s, F#5 q., E5 e | E5 q, D5 h",
  ].join(" | "),
  right: [
    [
      "r q",
      "F#4+A4 h, A4+C#5 h | r e, F#5 q., F#5 q | G5 q., D5 e, G5 e, D5 e | r e, F#5 q., D5 q",
      "G5 h, E5 q, C#5 q | r e, F#4+B4 q., G4+B4 q | D5 q., A4 e, D5 e., F#5 s | C#5+E5 q, E5+G5 h",
      "B4 q, D5 q., B4 e | G4+C#5 q, F#4+A4 h",
    ].join(" | "),
  ],
  left: [
    [
      "r q",
      "D2+D3 q, A3 e, D4 e, F#4 e, D4 e, A3 e, F#3 e | D2+D3 q, A3 e, D4 e, F#4 e, A3 e | D2+D3 q, G3 e, B3 e, D4 e, B3 e | D2+D3 q, A3 e, D4 e, F#4 e, A3 e",
      "G2+G3 q, D4 e, B3 e, A2+A3 q, E4 e, C#4 e | B1+B2 q, F#3 e, B3 e, D4 e, B3 e | A1+A2 q, F#3 e, A3 e, D4 e, A3 e | A1+A2 q, E3 e, G3 e, C#4 e, G3 e",
      "B1+B2 q, F#3 e, B3 e, G1+G2 q | A1+A2+G3 q, D2+A2+D3+F#3 h",
    ].join(" | "),
  ],
};
