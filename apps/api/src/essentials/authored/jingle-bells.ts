import type { AuthoredScore } from "./notation.js";

/**
 * Verse and chorus as sung today (the chorus is the later popular form, not
 * Pierpont's 1857 one), in G, on the usual harmony of the tune: thirds and
 * sixths under the tune, octave basses with after-beat chords in the verse
 * and a stride left hand in the chorus.
 */
export const jingleBells: AuthoredScore = {
  meter: [4, 4],
  bpm: 176,
  melody: [
    // Verse
    "D4 q, B4 q, A4 q, G4 q | D4 h., D4 e, D4 e | D4 q, B4 q, A4 q, G4 q | E4 w",
    "E4 q, C5 q, B4 q, A4 q | F#4 w | D5 q, D5 q, C5 q, A4 q | B4 w",
    "D4 q, B4 q, A4 q, G4 q | D4 w | D4 q, B4 q, A4 q, G4 q | E4 w",
    "E4 q, C5 q, B4 q, A4 q | D5 q, D5 q, D5 q., D5 e | E5 q, D5 q, C5 q, A4 q | G4 h, D5 h",
    // Chorus
    "B4 q, B4 q, B4 h | B4 q, B4 q, B4 h | B4 q, D5 q, G4 q., A4 e | B4 w",
    "C5 q, C5 q, C5 q., C5 e | C5 q, B4 q, B4 q, B4 e, B4 e | B4 q, A4 q, A4 q, B4 q | A4 h, D5 h",
    "B4 q, B4 q, B4 h | B4 q, B4 q, B4 h | B4 q, D5 q, G4 q., A4 e | B4 w",
    "C5 q, C5 q, C5 q., C5 e | C5 q, B4 q, B4 q, B4 e, B4 e | D5 q, D5 q, C5 q, A4 q | G4 h, r h",
  ].join(" | "),
  right: [
    [
      // Verse
      "r h, D4 h | r w | r h, D4 h | r w",
      "r h, E4 h | D4 w | F#4+A4 h, F#4 h | D4+G4 w",
      "r h, D4 h | r w | r h, D4 h | r w",
      "r h, E4 h | F#4+A4 h, F#4+A4 h | F#4+C5 h, F#4 h | D4 h, F#4+C5 h",
      // Chorus
      "D4+G4 h, D4+G4 h | D4+G4 h, D4+G4 h | E4+G4 h, D4+F#4 h | D4+G4 h, D4+F4 h",
      "E4+G4 h, E4+G4 h | D4+G4 h, D4+G4 h | E4+G4 h, C#4+G4 h | F#4 h, F#4+C5 h",
      "D4+G4 h, D4+G4 h | D4+G4 h, D4+G4 h | E4+G4 h, D4+F#4 h | D4+G4 h, D4+F4 h",
      "E4+G4 h, E4+G4 h | D4+G4 h, D4+G4 h | F#4+A4 h, D4+F#4 h | B3+D4 h, r h",
    ].join(" | "),
  ],
  left: [
    [
      // Verse
      "G1+G2 q, D3+G3+B3 q, D2 q, D3+G3+B3 q | G1+G2 q, D3+G3+B3 q, D2 q, D3+G3+B3 q | G1+G2 q, D3+G3+B3 q, A2 q, B2 q | C2+C3 q, E3+G3+C4 q, B2 q, E3+G3+C4 q",
      "A1+A2 q, E3+A3+C4 q, E2 q, E3+A3+C4 q | D2+D3 q, D3+F#3+A3 q, F#2 q, D3+F#3+A3 q | D2+D3 q, F#3+A3+C4 q, E2 q, F#2 q | G1+G2 q, F#2 q, E2 q, D2 q",
      "G1+G2 q, D3+G3+B3 q, D2 q, D3+G3+B3 q | G1+G2 q, D3+G3+B3 q, D2 q, D3+G3+B3 q | G1+G2 q, D3+G3+B3 q, A2 q, B2 q | C2+C3 q, E3+G3+C4 q, B2 q, E3+G3+C4 q",
      "A1+A2 q, E3+A3+C4 q, G2 q, E3+A3+C4 q | F#2+F#3 q, D3+F#3+A3 q, E2 q, D3+F#3+A3 q | D2+D3 q, F#3+A3+C4 q, E2 q, F#2 q | G1+G2 q, D3+G3+B3 q, D2 q, F#3+A3+C4 q",
      // Chorus
      "G1+G2 q, D3+G3+B3 q, F#2+F#3 q, D3+G3+B3 q | E2+E3 q, D3+G3+B3 q, D2+D3 q, D3+G3+B3 q | E2+E3 q, E3+G3+B3 q, D2+D3 q, D3+F#3+A3 q | G1+G2 q, D3+G3+B3 q, F2+F3 q, D3+F3+B3 q",
      "E2+E3 q, E3+G3+C4 q, C2+C3 q, E3+G3+C4 q | G1+G2 q, D3+G3+B3 q, D2+D3 q, D3+G3+B3 q | A1+A2 q, E3+G3+C#4 q, C#2+C#3 q, E3+G3+A3 q | D2+D3 q, C2+C3 q, B1+B2 q, A1+A2 q",
      "G1+G2 q, D3+G3+B3 q, F#2+F#3 q, D3+G3+B3 q | E2+E3 q, D3+G3+B3 q, D2+D3 q, D3+G3+B3 q | E2+E3 q, E3+G3+B3 q, D2+D3 q, F#3+A3+C4 q | G1+G2 q, D3+G3+B3 q, F2+F3 q, D3+F3+B3 q",
      "E2+E3 q, E3+G3+C4 q, C2+C3 q, E3+G3+C4 q | G1+G2 q, D3+G3+B3 q, D2+D3 q, D3+G3+B3 q | F#2+F#3 q, F#3+A3+C4 q, D2+D3 q, F#3+A3+C4 q | G1+G2 h, r h",
    ].join(" | "),
  ],
};
