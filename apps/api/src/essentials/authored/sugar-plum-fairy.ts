import type { AuthoredScore } from "./notation.js";

/**
 * The pizzicato introduction and celesta theme of the Dance of the
 * Sugar-Plum Fairy (bars 1–16), in the
 * register and texture of Tchaikovsky's own piano arrangement of the suite
 * (Jurgenson, 1892): the tune on top with the celesta's sixths beneath it,
 * and the left hand's plucked E pedal with the chromatic chords over it.
 */
const theme = [
  "r e, G6 s, E6 s, G6 e, F#6 e | D#6 e, E6 e, D6 s, D6 s, D6 e",
  "C#6 s, C#6 s, C#6 e, C6 s, C6 s, C6 e | B5 s, E6 s, C6 s, E6 s, B5 e, r e",
];
const themeSixths = [
  "r e, B5 s, G5 s, B5 e, A5 e | F#5 e, G5 e, G#5 s, G#5 s, G#5 e",
  "G5 s, G5 s, G5 e, F#5 s, F#5 s, F#5 e | r s, G5 s, r s, F#5 s, r e, r e",
];
const themeBass = [
  "E3 e, G3+B3 e, E3 e, A3+C4 e | E3 e, A#3+C#4 e, E3 e, G#3+D4 e",
  "E3 e, C#4+E4 e, E3 e, D#4+F#4 e | E4+G4 e, E4+F#4 e, E4+G4 e, E3 t, D3 t, C3 t, B2 t",
];

export const sugarPlumFairy: AuthoredScore = {
  meter: [2, 4],
  bpm: 80,
  melody: [
    "r h | r h | r h | r h",
    ...theme,
    "r e, G5 s, E5 s, G5 e, F#5 e | C6 e, B5 e, G6 s, G6 s, G6 e",
    "F6 s, F6 s, F6 e, E6 s, E6 s, E6 e | D#6 s, F#6 s, E6 s, F#6 s, D#6 e, r e",
    ...theme,
  ].join(" | "),
  right: [
    [
      "r e, G3+B3+E4 e, r e, A3+C4+F#4 e | r e, A#3+C#4+G4 e, r e, A3+C4+D#4 e",
      "r e, G3+B3+E4 e, r e, A3+C4+F#4 e | r e, A#3+C#4+G4 e, r e, A3+C4+D#4 e",
      ...themeSixths,
      "r e, C5 s, r s, C5 e, C5 e | F#5 e, G5 e, C#6 s, C#6 s, C#6 e",
      "D6 s, D6 s, D6 e, A#5 s, A#5 s, A#5 e | B5 s, r s, A#5 s, r s, B5 e, r e",
      ...themeSixths,
    ].join(" | "),
  ],
  left: [
    [
      "E2+E3 e, r e, E2+E3 e, r e | E2+E3 e, r e, E2+E3 e, r e | E2+E3 e, r e, E2+E3 e, r e | E2+E3 e, r e, E2+E3 e, r e",
      ...themeBass,
      "A#2 e, E3+G3+C#4 e, A2 e, D#3+F#3+C4 e | G2 e, E3+G3+B3 e, F#2 e, E3+A#3+C#4 e",
      "F3 e, G#3+B3+D4 e, F#3 e, A#3+C#4+E4 e | B2+F#3+B3 e, B2+F#3+A3 e, B2+F#3+B3 e, B3 t, A3 t, G3 t, F#3 t",
      ...themeBass,
    ].join(" | "),
  ],
};
