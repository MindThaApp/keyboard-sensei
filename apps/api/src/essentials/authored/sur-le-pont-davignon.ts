import type { AuthoredScore } from "./notation.js";

/**
 * The French round as transcribed in John Chambers' ABC collection and on ingeb.org (Lieder: Sur le pont d'Avignon), checked against the Wikimedia Commons MIDI "Sur le pont d'Avignon". The first strain, the "Les beaux messieurs" strain, then the first strain again. The left hand is simple chords.
 */
export const surLePontDavignon: AuthoredScore = {
  meter: [2, 4],
  bpm: 108,
  melody: [
    "G4 e, G4 e, G4 q | A4 e, A4 e, A4 q | B4 e, C5 e, D5 e, G4 e | F#4 e, G4 e, A4 e, D4 e",
    "G4 e, G4 e, G4 q | A4 e, A4 e, A4 q | B4 e, C5 e, D5 e, G4 e | A4 e, F#4 e, G4 q",
    "G4 e, G4 e, G4 e, G4 e | A4 q, G4 e, G4 e | G4 e, G4 e, G4 e, G4 e | A4 q, G4 q",
    "G4 e, G4 e, G4 q | A4 e, A4 e, A4 q | B4 e, C5 e, D5 e, G4 e | F#4 e, G4 e, A4 e, D4 e",
    "G4 e, G4 e, G4 q | A4 e, A4 e, A4 q | B4 e, C5 e, D5 e, G4 e | A4 e, F#4 e, G4 q",
    "G4 h",
  ].join(" | "),
  left: [
    [
      "G2 q, B3+D4 q | D2 q, F#3+C4 q | G2 q, B3+D4 q | D2 q, F#3+C4 q",
      "G2 q, B3+D4 q | D2 q, F#3+C4 q | G2 q, B3+D4 q | D2 q, G2 q",
      "G2 q, B3+D4 q | D2 q, F#3+C4 q | G2 q, B3+D4 q | D2 q, G2 q",
      "G2 q, B3+D4 q | D2 q, F#3+C4 q | G2 q, B3+D4 q | D2 q, F#3+C4 q",
      "G2 q, B3+D4 q | D2 q, F#3+C4 q | G2 q, B3+D4 q | D2 q, G2 q",
      "G2+B3+D4 h",
    ].join(" | "),
  ],
};
