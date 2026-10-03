import type { AuthoredScore } from "./notation.js";

/**
 * The air as Weatherly set it for "Danny Boy" (Boosey, 1913), in his
 * E flat, with the harmony of his piano part (E flat, A flat, B flat 7, the
 * E flat 7 lift into the climax and the B flat 7 over A flat in the bass):
 * an inner voice under the tune, broken chords in the left hand.
 */
const EB = "Eb2 e, Bb2 e, Eb3 e, Bb2 e";
const EB7 = "Eb2 e, Bb2 e, Db3 e, Bb2 e";
const EB_BB = "Bb1 e, Bb2 e, Eb3 e, Bb2 e";
const AB = "Ab2 e, C3 e, Eb3 e, C3 e";
const BB7 = "Bb1 e, F2 e, Ab2 e, F2 e";
const BB7_AB = "Ab2 e, D3 e, F3 e, D3 e";
const CM = "C2 e, G2 e, Eb3 e, G2 e";
const bar = (a: string, b: string): string => `${a}, ${b}`;

export const dannyBoy: AuthoredScore = {
  meter: [4, 4],
  bpm: 66,
  pickupBeats: 1.5,
  melody: [
    "D4 e, Eb4 e, F4 e",
    "G4 q., F4 e, G4 e, C5 e, Bb4 e, G4 e | F4 e, Eb4 e, C4 q~, C4 e, Eb4 e, G4 e, Ab4 e",
    "Bb4 q., C5 e, Bb4 e, G4 e, Eb4 e, G4 e | F4 h~, F4 e, D4 e, Eb4 e, F4 e",
    "G4 q., F4 e, G4 e, C5 e, Bb4 e, G4 e | F4 e, Eb4 e, C4 q~, C4 e, D4 e, Eb4 e, F4 e",
    "G4 q., Ab4 e, G4 e, F4 e, Eb4 e, F4 e | Eb4 h~, Eb4 e, Bb4 e, C5 e, D5 e",
    "Eb5 q., D5 e, D5 e, C5 e, Bb4 e, C5 e | Bb4 e, G4 e, Eb4 q~, Eb4 e, Bb4 e, C5 e, D5 e",
    "Eb5 q., D5 e, D5 e, C5 e, Bb4 e, G4 e | F4 h~, F4 e, Bb4 e, Bb4 e, Bb4 e",
    "G5 q., F5 e, F5 e, Eb5 e, C5 e, Eb5 e | Bb4 e, G4 e, Eb4 q~, Eb4 e, D4 e, Eb4 e, F4 e",
    "G4 e, C5 e, Bb4 e, G4 e, F4 e, Eb4 e, C4 e, D4 e | Eb4 h~, Eb4 e",
  ].join(" | "),
  right: [
    [
      "r q.",
      "Eb4 q., D4 e, Eb4 h | Ab3 h, Ab3 q, C4 q",
      "G4 q., Ab4 e, Bb3 h | D4 h, Ab3 h",
      "Eb4 q., D4 e, Db4 h | Ab3 w",
      "Eb4 h, D4 q, Ab3 q | G3 h, G3 q, G4 q",
      "G4 q., F4 e, Ab4 h | G3 h, G3 q, G4 q",
      "G4 q., F4 e, Eb4 h | D4 h., F4 q",
      "Bb4 q., Ab4 e, C5 q, Ab4 q | G3 h, Ab3 h",
      "Eb4 h, Ab3 h | G3+Bb3 h~, G3+Bb3 e",
    ].join(" | "),
  ],
  left: [
    [
      "r q.",
      [bar(EB, EB), bar(AB, AB), bar(EB, EB), bar(BB7, BB7)].join(" | "),
      [bar(EB, EB7), bar(AB, BB7), bar(EB_BB, BB7), bar(EB, EB)].join(" | "),
      [bar(EB, AB), bar(EB, EB), bar(EB, CM), bar(BB7, BB7)].join(" | "),
      [bar(EB7, AB), bar(EB, BB7_AB), bar(EB_BB, BB7), "Eb2+Bb2 h~, Eb2+Bb2 e"].join(" | "),
    ].join(" | "),
  ],
};
