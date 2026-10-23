import type { AuthoredScore } from "./notation.js";

/**
 * The French folk song as transcribed on ingeb.org (Lieder: Au clair de la lune) and in the Wikimedia Commons MIDI
 * "Ly au clair de la lune accords melodie paroles" (moved from C). Sixteen bars; the left hand is simple chords.
 */
export const auClairDeLaLune: AuthoredScore = {
  meter: [4, 4],
  bpm: 96,
  melody: [
    "G4 q, G4 q, G4 q, A4 q | B4 h, A4 h | G4 q, B4 q, A4 q, A4 q | G4 w",
    "G4 q, G4 q, G4 q, A4 q | B4 h, A4 h | G4 q, B4 q, A4 q, A4 q | G4 w",
    "A4 q, A4 q, A4 q, A4 q | E4 h, E4 h | A4 q, G4 q, F#4 q, E4 q | D4 w",
    "G4 q, G4 q, G4 q, A4 q | B4 h, A4 h | G4 q, B4 q, A4 q, A4 q | G4 w",
  ].join(" | "),
  left: [
    [
      "G2 q, B3+D4 q, G2 q, B3+D4 q | G2 q, B3+D4 q, D2 q, F#3+C4 q | G2 q, B3+D4 q, G2 q, B3+D4 q | G2+B3+D4 w",
      "G2 q, B3+D4 q, G2 q, B3+D4 q | G2 q, B3+D4 q, D2 q, F#3+C4 q | G2 q, B3+D4 q, G2 q, B3+D4 q | G2+B3+D4 w",
      "A2 q, E3+C4 q, A2 q, E3+C4 q | C3 q, E3+G3 q, C3 q, E3+G3 q | D2 q, F#3+C4 q, D2 q, F#3+C4 q | D2+F#3+C4 w",
      "G2 q, B3+D4 q, G2 q, B3+D4 q | G2 q, B3+D4 q, D2 q, F#3+C4 q | G2 q, B3+D4 q, G2 q, B3+D4 q | G2+B3+D4 w",
    ].join(" | "),
  ],
};
