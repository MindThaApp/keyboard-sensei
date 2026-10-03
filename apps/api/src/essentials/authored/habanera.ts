import type { AuthoredScore } from "./notation.js";

/**
 * The first verse of the Habanera ("L'amour est un oiseau rebelle"), from the
 * last two bars of the introduction to the change to D major (bars 3-20),
 * after the Choudens and Schirmer vocal scores: Carmen's line on top, the
 * off-beat chords of the piano reduction in the right hand, and the
 * habanera bass (D, then A-F-A or B flat-G-B flat) in the left.
 */
const dm = "D2 e, r s, A2 s, F3 e, A2 e";
const gm = "D2 e, r s, Bb2 s, G3 e, Bb2 e";
const a7 = "D2 e, r s, A2 s, G3 e, A2 e";
const dMajor = "D2 e, r s, A2 s, F#3 e, A2 e";

export const habanera: AuthoredScore = {
  meter: [2, 4],
  bpm: 72,
  melody: [
    "r h | r q, D5 e, C#5 e",
    "C5 e3, C5 e3, C5 e3, B4 e, Bb4 e | A4 e, A4 s, A4 s, G#4 e, G4 e",
    "F4 s3, G4 s3, F4 s3, E4 s, F4 s, G4 e, F4 e | E4 e, r e, D5 e, C#5 e",
    "C5 e3, C5 e3, C5 e3, B4 e, Bb4 e | A4 s, A4 s, r s, A4 s, G4 e, F4 e",
    "E4 s3, F4 s3, E4 s3, D4 s, E4 s, F4 e, E4 e | D4 q, D5 e, C#5 e",
    "C5 e3, C5 e3, C5 e3, B4 e, Bb4 e | A4 s, A4 s, r s, A4 s, G#4 e, G4 e",
    "F4 s3, G4 s3, F4 s3, E4 s, F4 s, G4 e, F4 e | E4 q, D5 e, C#5 e",
    "C5 e3, C5 e3, C5 e3, B4 e, Bb4 e | A4 s, A4 s, r s, A4 s, G4 e, F4 e",
    "E4 s3, F4 s3, E4 s3, D4 s, E4 s, F4 e, E4 e | D4 q., r e",
  ].join(" | "),
  right: [
    [
      "r h | r h",
      "D4+F4 e, r e, D4+F4 e, D4+F4 e | D4+F4 e, r e, D4+F4 e, D4+F4 e",
      "A3+D4 e, r e, A3+C#4 e, A3+D4 e | Bb3+D4 e, r e, D4+E4 e, D4+E4 e",
      "D4+E4 e, r e, D4+E4 e, D4+E4 e | D4+E4 e, r e, Bb3+D4 e, Bb3+D4 e",
      "A3+D4 e, r e, A3+C#4 e, A3+D4 e | A3 e, r e, F4+A4 e, E4+A4 e",
      "D4+F4 e, r e, D4+F4 e, D4+F4 e | D4+F4 e, r e, D4+F4 e, D4+F4 e",
      "A3+D4 e, r e, A3+C#4 e, A3+D4 e | Bb3+D4 e, r e, D4+E4 e, D4+E4 e",
      "D4+E4 e, r e, D4+E4 e, D4+E4 e | D4+E4 e, r e, Bb3+D4 e, Bb3+D4 e",
      "A3+C#4 e, r e, A3+C#4 e, A3+C#4 e | F#3+A3 e, r e, F#4+A4 e, F#4+A4 e",
    ].join(" | "),
  ],
  left: [
    [dm, dm, dm, dm, dm, gm, gm, gm, dm, dm, dm, dm, dm, gm, gm, gm, a7, dMajor].join(" | "),
  ],
};
