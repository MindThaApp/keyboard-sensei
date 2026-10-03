import type { AuthoredScore } from "./notation.js";

/**
 * The tune as sung today, verse and chorus, in F major (the key of Elson's
 * "Folk Songs of Many Nations", 1905): an inner voice in sixths and chord
 * tones under the tune, and flowing broken chords on F, C7, B flat, D minor
 * and G minor in the left hand.
 */
const F = "F2 e, C3 e, F3 e, C3 e";
const C7 = "C2 e, G2 e, E3 e, G2 e";
const BB = "Bb2 e, F3 e, D4 e, F3 e";
const DM = "D2 e, A2 e, D3 e, F3 e";
const GM = "G2 e, D3 e, Bb3 e, D3 e";
const bar = (a: string, b: string): string => `${a}, ${b}`;

export const auldLangSyne: AuthoredScore = {
  meter: [4, 4],
  bpm: 76,
  pickupBeats: 1,
  melody: [
    "C4 q",
    "F4 q., F4 e, F4 q, A4 q | G4 q., F4 e, G4 q, A4 q | F4 q., F4 e, A4 q, C5 q | D5 h., D5 q",
    "C5 q., A4 e, A4 q, F4 q | G4 q., F4 e, G4 q, A4 q | F4 q., D4 e, D4 q, C4 q | F4 h., D5 q",
    "C5 q., A4 e, A4 q, F4 q | G4 q., F4 e, G4 q, D5 q | C5 q., A4 e, A4 q, C5 q | D5 h., D5 q",
    "C5 q., A4 e, A4 q, F4 q | G4 q., F4 e, G4 q, A4 q | F4 q., D4 e, D4 q, C4 q | F4 h.",
  ].join(" | "),
  right: [
    [
      "r q",
      "C4 q., A3 e, A3 q, C4 q | Bb3 q., A3 e, Bb3 q, C4 q | A3 q., A3 e, C4 q, F4 q | F4+Bb4 h., F4+Bb4 q",
      "F4 q., C4 e, C4 q, A3 q | Bb3 q., A3 e, Bb3 q, C4 q | A3 q., A3 e, Bb3 q, Bb3 q | A3+C4 h., F4+Bb4 q",
      "F4 q., C4 e, C4 q, A3 q | Bb3 q., A3 e, Bb3 q, Bb4 q | F4 q., C4 e, C4 q, F4 q | F4+Bb4 h., F4+Bb4 q",
      "F4 q., C4 e, C4 q, A3 q | Bb3 q., A3 e, Bb3 q, C4 q | A3 q., A3 e, Bb3 q, Bb3 q | A3+C4 h.",
    ].join(" | "),
  ],
  left: [
    [
      "r q",
      [bar(F, F), bar(C7, C7), bar(F, F), bar(BB, BB)].join(" | "),
      [bar(F, F), bar(C7, C7), bar(DM, C7), bar(F, BB)].join(" | "),
      [bar(F, F), bar(C7, GM), bar(F, F), bar(BB, BB)].join(" | "),
      [bar(F, F), bar(C7, C7), bar(DM, C7), "F2+C3+A3 h."].join(" | "),
    ].join(" | "),
  ],
};
