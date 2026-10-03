import type { AuthoredScore } from "./notation.js";

/**
 * The oboe theme that opens Act II of Swan Lake (No. 10, Scène, Moderato,
 * bars 2–9), with the harmony of Langer's piano score (Jurgenson, 1895)
 * and Kashkin's piano score: the B pedal under B minor and E minor, and the
 * chromatic G sharp diminished / F sharp seventh close of each half. The
 * string tremolo becomes broken chords in the left hand.
 */
const Bm = "B2 e, F#3 e, B3 e, F#3 e";
const EmB = "B2 e, G3 e, B3 e, G3 e";
const Fs = "F#2 e, C#3 e, F#3 e, A#3 e";
const Fs7 = "F#2 e, C#3 e, E3 e, A#3 e";
const chromatic = "G#2 e, D3+F3+B3 e, G2+C#3+E3 e, F#2+A#2+E3 e";
const chromaticToG = "G#2 e, D3+F3+B3 e, G2 e, C#3+E3 e";

export const swanLakeTheme: AuthoredScore = {
  meter: [4, 4],
  bpm: 72,
  melody: [
    "F#5 h, B4 e, C#5 e, D5 e, E5 e | F#5 q., D5 e, F#5 q., D5 e",
    "F#5 q., B4 e, D5 e, B4 e, G4 e, D5 e | B4 h, B4 e, E5 e, D5 e, C#5 e",
    "F#5 h, B4 e, C#5 e, D5 e, E5 e | F#5 q., D5 e, F#5 q., D5 e",
    "F#5 q., B4 e, D5 e, B4 e, G4 e, D5 e | B4 h., r q",
  ].join(" | "),
  right: [
    [
      "D4+F#4 h, E4+G4 h | F#4+B4 w",
      "D4+F#4 h, D4+F4 q, C#4+E4 q | D4+F#4 h, E4+G4 h",
      "D4+F#4 h, D4+F4 q, C#4+E4 q | F#4+B4 h, F#4+A#4 h",
      "C#4+E4 h, D4+F4 q, C#4+E4 q | D4+F#4 h., r q",
    ].join(" | "),
  ],
  left: [
    [
      `${Bm}, ${EmB} | ${Bm}, ${Bm}`,
      `${Bm}, ${chromatic} | ${Bm}, ${EmB}`,
      `${Bm}, ${chromaticToG} | ${Bm}, ${Fs}`,
      `${Fs7}, ${chromatic} | B1 e, F#2 e, B2 e, D3 e, F#3 e, B3 e, F#3 e, D3 e`,
    ].join(" | "),
  ],
};
