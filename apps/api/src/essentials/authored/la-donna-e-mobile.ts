import type { AuthoredScore } from "./notation.js";

/**
 * The Duke's first stanza of "La donna è mobile" (from "La donna è mobile"
 * to the first "e di pensier"), the tenor line at written pitch, after the
 * Schirmer (1913) and Boosey vocal scores: the oom-pah-pah of the piano
 * reduction in the left hand (bass, then two chords) and a held harmony
 * note under the tune in the right. The refrain keeps Verdi's rising
 * chromatic bass (E sharp, F sharp, F double sharp, G sharp, A sharp).
 */
const tonic = "B2 e, F#3+B3+D#4 e, F#3+B3+D#4 e";
const dominant = "F#2 e, A#3+C#4+E4 e, A#3+C#4+E4 e";

const verseMelody = [
  "D#5 e, D#5 e, D#5 e | F#5 s., E5 t, C#5 q | C#5 e, C#5 e, C#5 e | E5 s., D#5 t, B4 q",
  "D#5 e, C#5 e, B4 e | B4 s., A#4 t, A#4 q | C#5 e, B4 e, G#4 e | G#4 s., F#4 t, F#4 q",
].join(" | ");
const verseInner = "B4 q. | B4 q. | A#4 q. | A#4 q. | A#4 q. | E4 q. | E4 q. | D#4 q.";
const verseLeft = [tonic, tonic, dominant, dominant, dominant, dominant, dominant, tonic].join(" | ");

export const laDonnaEMobile: AuthoredScore = {
  meter: [3, 8],
  bpm: 96,
  melody: [
    verseMelody,
    verseMelody,
    "C#5 s., D#5 t, C#5 e, C#5 e | F#5 s, r s, C#5 q | D#5 s., E5 t, D#5 e, D#5 e | G#5 s, r s, D#5 q",
    "F#5 s., G#5 t, F#5 e, F#5 e | G#5 q, F#5 e | E5 s3, F#5 s3, E5 s3, D#5 s, r s, C#5 s, r s | B4 q, r e",
  ].join(" | "),
  right: [
    [
      verseInner,
      verseInner,
      "G#4 q. | A#4 q. | A#4 q. | B4 q. | C#5 q. | D#5 q. | G#4 e, F#4 e, E4 e | D#4 q, r e",
    ].join(" | "),
  ],
  left: [
    [
      verseLeft,
      verseLeft,
      "E#2 e, G#3+B3+C#4 e, G#3+B3+C#4 e",
      dominant,
      "G2 e, A#3+C#4+D#4 e, A#3+C#4+D#4 e",
      "G#2 e, G#3+B3+D#4 e, G#3+B3+D#4 e",
      "A#2 e, C#4+E4+F#4 e, C#4+E4+F#4 e",
      tonic,
      "E3+B3 e, D#3+B3 e, F#2+E3 e",
      "B2+F#3 q, r e",
    ].join(" | "),
  ],
};
