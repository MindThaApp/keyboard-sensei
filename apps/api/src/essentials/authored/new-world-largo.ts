import type { AuthoredScore } from "./notation.js";

/**
 * The cor anglais theme of the Largo (bars 7-18) at concert pitch, with the
 * string harmony and bass of the Simrock first edition (1894) gathered into
 * two hands, checked against Paul Juon's piano reduction (Simrock, 1899).
 */
export const newWorldLargo: AuthoredScore = {
  meter: [4, 4],
  bpm: 52,
  melody: [
    "F4 e., Ab4 s, Ab4 q, F4 e., Eb4 s, Db4 q | Eb4 e., F4 s, Ab4 e., F4 s, Eb4 h",
    "F4 e., Ab4 s, Ab4 q, F4 e., Eb4 s, Db4 q | Eb4 e, F4 e, Eb4 e., Db4 s, Db4 h",
    "Bb4 e., Db5 s, Db5 q, C5 e, Ab4 e, Bb4 q | Bb4 e, Db5 e, C5 e, Ab4 e, Bb4 h",
    "Bb4 e., Db5 s, Db5 q, C5 e, Ab4 e, Bb4 q | Bb4 e, Db5 e, C5 e, Ab4 e, Bb4 h",
    "F4 e., Ab4 s, Ab4 q, F4 e, Eb4 e, Db4 q | Eb4 e., F4 s, Ab4 e., F4 s, Eb4 h",
    "F4 e., Ab4 s, Ab4 q, Db5 e., Eb5 s, F5 q | Eb5 e., Db5 s, Eb5 e, Bb4 e, Db5 h",
  ].join(" | "),
  right: [
    [
      "r w | C4 w | r h, A3 h | Bb3 q, C4 q, Ab3 h",
      "Gb4 e., Bb4 s, Bb4 q, Ab4 e, F4 e, Gb4 q | Gb4 e, Bb4 e, Ab4 e, F4 e, Gb4 h",
      "Gb4 e., Bb4 s, Bb4 q, Ab4 e, F4 e, Gb4 q | Gb4 e, Bb4 e, Ab4 e, F4 e, Gb4 h",
      "r w | C4 w | r h, Ab4 h | Gb4 q., Gb4 e, F4 h",
    ].join(" | "),
  ],
  left: [
    [
      "Db2 w | Ab2 w | Db2 h, F2 h | Gb2 q, Ab2 q, Db2 h",
      "Gb2 w | Gb2 w | Gb2 w | Gb2 w",
      "Ab2 w | Ab2 w | Db3 q, C3 q, Bb2 q, Ab2 q | Ab2 h, Db2 h",
    ].join(" | "),
    [
      "Ab2+F3 w | Eb3+Gb3 w | Ab2+F3 h, Db3 h | Db3 q, Eb3 q, Ab2+F3 h",
      "Db3 w | Db3 w | Db3 w | Db3 w",
      "Db3+F3 w | Gb3 q, Eb3 e., F3 s, Gb3 h | F3 q, Eb3 q, Db3+F3 q, Db3+F3 q | Gb3 h, Ab2+F3 h",
    ].join(" | "),
  ],
};
