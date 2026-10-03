import type { AuthoredScore } from "./notation.js";

/**
 * The first strain of Brahms's Hungarian Dance No. 5 in F sharp minor
 * (bars 1–24: the strain and its forte restatement an octave higher), with the rhythm of the original four-hand version and the
 * bass-and-chord left hand of Brahms's own solo arrangement (Simrock):
 * F sharp minor and its C sharp seventh, the thirds and octaves under the
 * tune, and the light sixteenth-note close.
 */
const i = "F#2 e, A2+C#3+F#3 e, C#2 e, A2+C#3+F#3 e";
const iHigh = "F#2 e, F#3+A3+C#4 e, C#2 e, F#3+A3+C#4 e";
const V = "C#2 e, G#2+B2+E#3 e, G#1 e, G#2+B2+E#3 e";
const Vlow = "C#2 e, E#2+G#2+B2 e, G#1 e, E#2+G#2+B2 e";
const VHigh = "C#2 e, G#3+B3+E#4 e, G#1 e, G#3+B3+E#4 e";
const iv = "B1 e, B2+D3+F#3 e, F#1 e, B2+D3+F#3 e";

export const hungarianDance5: AuthoredScore = {
  meter: [2, 4],
  bpm: 112,
  melody: [
    "C#4 q., F#4 e | A4 q., F#4 e | E#4 q., F#4 s, G#4 s | F#4 h",
    "D4 q., E4 s, F#4 s | C#4 h | B3 s, A3 s, A3 s, G#3 s, G#3 e., C#4 s | F#3 h",
    "C#5 q., F#5 s, A5 s | C#6 q., A5 e | G#5 q., A5 s, B5 s | A5 h",
    "D5 s, E5 s, F#5 s, D5 s, C#5 s, D5 s, E5 s, C#5 s | B4 s, C#5 s, D5 s, B4 s, A4 s, B4 s, C#5 s, A4 s",
    "B4 s, A4 s, A4 s, G#4 s, G#4 e., C#5 s | F#4 q, F#5 e, r e",
    // Bars 17-24: the strain again, forte, an octave higher
    "C#5 q., F#5 e | A5 q., F#5 e | E#5 q., F#5 s, G#5 s | F#5 h",
    "D5 q., E5 s, F#5 s | C#5 h | B4 s, A4 s, A4 s, G#4 s, G#4 e., C#5 s | F#4 h",
  ].join(" | "),
  right: [
    [
      "r h | r h | r h | r h",
      "B3 q., C#4 s, D4 s | A3 h | r h | r h",
      "C#4 q., F#4 s, A4 s | C#5 q., A4 e | G#4 q., A4 s, B4 s | A4+C#5+F#5 h",
      "r h | r h",
      "r h | r q, A4+C#5 e, r e",
      "C#4 q., F#4 e | A4 q., F#4 e | G#4+B4 q., A4 s, B4 s | A4+C#5 h",
      "B4 q., C#5 s, D5 s | A4 h | r h | r h",
    ].join(" | "),
  ],
  left: [
    [
      i, i, V, i,
      iv, i, Vlow, "F#1 e, F#2+A2+C#3 e, C#2 e, F#2+A2+C#3 e",
      iHigh, iHigh, VHigh, iHigh,
      "F#3 e, A3 e, E3 e, A3+C#4 e", "D3 e, F#3+B3 e, C#3 e, A3+C#4+E4 e",
      "C#2 e, G#3+B3+E#4 e, r e, E#3+G#3+B3 e", "F#2 e, F#3+A3+C#4 e, F#1+C#2 e, r e",
      i, i, V, i,
      iv, i, Vlow, "F#1+F#2 e, F#2+A2+C#3 e, r q",
    ].join(" | "),
  ],
};
