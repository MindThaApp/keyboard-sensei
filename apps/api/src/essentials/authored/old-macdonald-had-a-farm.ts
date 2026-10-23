import type { AuthoredScore } from "./notation.js";

/**
 * The children's song as set in the Wikimedia Commons MIDI by Nachtbold (CC0), checked note for note against the MIDI setting by Rabanus Flavus (CC0, moved from A). One verse: the two opening lines, the "with a moo-moo here" line and the opening line again. The left hand is simple chords.
 */
export const oldMacdonaldHadAFarm: AuthoredScore = {
  meter: [2, 4],
  bpm: 100,
  melody: [
    "G4 q, G4 q | G4 q, D4 q | E4 q, E4 q | D4 h",
    "B4 q, B4 q | A4 q, A4 q | G4 h~ | G4 q, D4 q",
    "G4 q, G4 q | G4 q, D4 q | E4 q, E4 q | D4 h",
    "B4 q, B4 q | A4 q, A4 q | G4 h~ | G4 q, D4 e, D4 e",
    "G4 q, G4 q | G4 q, D4 e, D4 e | G4 q, G4 q | G4 h",
    "G4 e, G4 e, G4 q | G4 e, G4 e, G4 q | G4 e, G4 e, G4 e, G4 e | G4 q, G4 q",
    "G4 q, G4 q | G4 q, D4 q | E4 q, E4 q | D4 h",
    "B4 q, B4 q | A4 q, A4 q | G4 h",
  ].join(" | "),
  left: [
    [
      "G2 q, B3+D4 q | G2 q, B3+D4 q | C3 q, E3+G3 q | G2 q, B3+D4 q",
      "G2 q, B3+D4 q | D2 q, F#3+C4 q | G2 q, B3+D4 q | G2 q, B3+D4 q",
      "G2 q, B3+D4 q | G2 q, B3+D4 q | C3 q, E3+G3 q | G2 q, B3+D4 q",
      "G2 q, B3+D4 q | D2 q, F#3+C4 q | G2 q, B3+D4 q | G2 q, B3+D4 q",
      "G2 q, B3+D4 q | G2 q, B3+D4 q | G2 q, B3+D4 q | G2 q, B3+D4 q",
      "G2 q, B3+D4 q | G2 q, B3+D4 q | G2 q, B3+D4 q | G2 q, B3+D4 q",
      "G2 q, B3+D4 q | G2 q, B3+D4 q | C3 q, E3+G3 q | G2 q, B3+D4 q",
      "G2 q, B3+D4 q | D2 q, F#3+C4 q | G2+B3+D4 h",
    ].join(" | "),
  ],
};
