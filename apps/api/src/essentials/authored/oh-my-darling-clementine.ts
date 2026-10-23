import type { AuthoredScore } from "./notation.js";

/**
 * The song (Percy Montrose, 1884) as set in the Wikimedia Commons MIDI by Rabanus Flavus (CC0), checked note for note against the MIDI sequence by Rainer Lewalter. Two verses; the left hand is simple chords.
 */
export const ohMyDarlingClementine: AuthoredScore = {
  meter: [4, 4],
  bpm: 96,
  pickupBeats: 1,
  melody: [
    "G4 e., G4 s | G4 q, D4 q, B4 e., B4 s, B4 q | G4 q, G4 e, B4 e, D5 q., D5 e | C5 e, B4 e, A4 h, A4 e, B4 e",
    "C5 q, C5 q, B4 e, A4 e, B4 q | G4 q, G4 e, B4 e, A4 q, D4 q | F#4 e, A4 e, G4 h, G4 e., G4 s | G4 q, D4 q, B4 e., B4 s, B4 q",
    "G4 q, G4 e, B4 e, D5 q., D5 e | C5 e, B4 e, A4 h, A4 e, B4 e | C5 q, C5 q, B4 e, A4 e, B4 q | G4 q, G4 e, B4 e, A4 q, D4 q",
    "F#4 e, A4 e, G4 h.",
  ].join(" | "),
  left: [
    [
      "r q | G2 q, B3+D4 q, G2 q, B3+D4 q | G2 q, B3+D4 q, G2 q, B3+D4 q | D2 q, F#3+C4 q, D2 q, F#3+C4 q",
      "D2 q, F#3+C4 q, D2 q, F#3+C4 q | G2 q, B3+D4 q, G2 q, B3+D4 q | D2 q, F#3+C4 q, G2 q, B3+D4 q | G2 q, B3+D4 q, G2 q, B3+D4 q",
      "G2 q, B3+D4 q, G2 q, B3+D4 q | D2 q, F#3+C4 q, D2 q, F#3+C4 q | D2 q, F#3+C4 q, D2 q, F#3+C4 q | G2 q, B3+D4 q, G2 q, B3+D4 q",
      "G2+B3+D4 w",
    ].join(" | "),
  ],
};
