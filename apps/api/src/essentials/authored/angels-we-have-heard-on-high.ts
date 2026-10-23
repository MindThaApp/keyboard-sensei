import type { AuthoredScore } from "./notation.js";

/**
 * The carol tune in its French form, "Les anges dans nos campagnes", read note by note from the public-domain 19th-century
 * songbook page on Wikimedia Commons ("Les Anges dans nos campagnes 1.jpg", from the compilation of editions of 1846 to 1892),
 * the verse and the descending "Gloria" runs, with the repeat written out. The pitches were compared bar by bar with an
 * independent transcription of the same tune (Commons "Les anges dans nos campagnes.mid") and the Gloria with the melody of
 * the LilyPond score on Wikipedia's "Angels We Have Heard on High" page (melody only; its harmonisation is not used). The
 * left hand is simple chords.
 */
export const angelsWeHaveHeardOnHigh: AuthoredScore = {
  meter: [4, 4],
  bpm: 96,
  melody: [
    "A4 q, A4 q, A4 q, A4 e, C5 e | C5 q., Bb4 e, A4 q, F4 e, r e | A4 q, A4 e., G4 s, A4 q, A4 e., C5 s | C5 q., Bb4 e, A4 q., r e",
    "A4 q, A4 q, A4 q, A4 e, C5 e | C5 q., Bb4 e, A4 q, F4 e, r e | A4 q, A4 e., G4 s, A4 q, A4 e., C5 s | C5 q., Bb4 e, A4 q., r e",
    "C5 h, D5 e, C5 e, Bb4 e, A4 e | Bb4 h, C5 e, Bb4 e, A4 e, G4 e | A4 h, Bb4 e, A4 e, G4 e, F4 e | G4 q., C4 e, C4 h",
    "F4 q, G4 q, A4 q, Bb4 q | A4 h, G4 q., r e | C5 h, D5 e, C5 e, Bb4 e, A4 e | Bb4 h, C5 e, Bb4 e, A4 e, G4 e",
    "A4 h, Bb4 e, A4 e, G4 e, F4 e | G4 q., C4 e, C4 h | F4 q, G4 q, A4 q, Bb4 q | A4 h, G4 h",
    "F4 w",
  ].join(" | "),
  left: [
    [
      "F2 h, A3+C4 h | F2 h, A3+C4 h | F2 h, A3+C4 h | C3 h, E3+Bb3 h",
      "F2 h, A3+C4 h | F2 h, A3+C4 h | F2 h, A3+C4 h | C3 h, E3+Bb3 h",
      "F2 h, A3+C4 h | Bb2 h, D3+F3 h | F2 h, A3+C4 h | C3 h, E3+G3 h",
      "F2 q, A3+C4 q, Bb2 q, D3+F3 q | F2 q, A3+C4 q, C3 q, E3+G3 q | F2 h, A3+C4 h | Bb2 h, D3+F3 h",
      "F2 h, A3+C4 h | C3 h, E3+G3 h | F2 q, A3+C4 q, Bb2 q, D3+F3 q | F2 q, A3+C4 q, C3 q, E3+G3 q",
      "F2 h, A3+C4 h",
    ].join(" | "),
  ],
};
