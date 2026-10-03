import type { AuthoredScore } from "./notation.js";

/**
 * Bars 1–20 of Grieg's "Morgenstemning" (Peer Gynt Suite No. 1, Op. 46/1),
 * closing on the E major downbeat of bar 21. The flute and oboe phrases are
 * kept in their own octaves; the harmony (E, C sharp minor, G sharp major,
 * the E augmented chord of bar 11, B major) follows the Peters piano
 * reduction of the Op. 23 score and Grieg's own four-hand version, with the
 * held wind chords under the flute and a rocking left hand.
 */
const E = "E2 e, B2 e, E3 e, G#3 e, E3 e, B2 e";
const E_CSm = "E2 e, B2 e, G#3 e, C#2 e, G#2 e, E3 e";
const Gs = "G#2 e, D#3 e, G#3 e, B#3 e, G#3 e, D#3 e";
const Gs_Eaug = "G#2 e, D#3 e, B#3 e, E2 e, B#2 e, G#3 e";
const Gs_CSm = "G#2 e, D#3 e, B#3 e, C#3 e, G#3 e, E3 e";
const B = "B1 e, F#2 e, B2 e, D#3 e, B2 e, F#2 e";

export const morningMood: AuthoredScore = {
  meter: [6, 8],
  bpm: 90,
  melody: [
    // Flute, bars 1–4
    "B5 e, G#5 e, F#5 e, E5 e, F#5 e, G#5 e | B5 e, G#5 e, F#5 e, E5 e, F#5 s, G#5 s, F#5 s, G#5 s",
    "B5 e, G#5 e, B5 e, C#6 e, G#5 e, C#6 e | B5 e, G#5 e, F#5 e, E5 q, r e",
    // Oboe, bars 5–8
    "B4 e, G#4 e, F#4 e, E4 e, F#4 e, G#4 e | B4 e, G#4 e, F#4 e, E4 e, F#4 s, G#4 s, F#4 s, G#4 s",
    "B4 e, G#4 e, B4 e, C#5 e, G#4 e, C#5 e | D#5 e, B#4 e, A#4 e, G#4 q, r e",
    // Flute, bars 9–12
    "D#6 e, B#5 e, A#5 e, G#5 e, A#5 e, B#5 e | D#6 e, B#5 e, A#5 e, G#5 e, A#5 s, B#5 s, A#5 s, B#5 s",
    "D#6 e, B#5 e, D#6 e, E6 e, B#5 e, E6 e | D#6 e, B#5 e, A#5 e, G#5 q, r e",
    // Oboe, bars 13–16
    "D#5 e, B#4 e, A#4 e, G#4 e, A#4 e, B#4 e | D#5 e, B#4 e, A#4 e, G#4 e, A#4 s, B#4 s, A#4 s, B#4 s",
    "D#5 e, B#4 e, D#5 e, E5 e, C#5 e, E5 e | F#5 e, D#5 e, C#5 e, B4 q, r e",
    // Flute and oboe answering, bars 17–20
    "F#6 e, D#6 e, C#6 e, B5 e, C#6 s, D#6 s, C#6 s, D#6 s | F#5 e, D#5 e, C#5 e, B4 e, C#5 s, D#5 s, C#5 s, D#5 s",
    "F#6 e, D#6 e, B5 e, F#5 e, D#5 e, B4 e | F#6 e, D#6 e, B5 e, F#5 e, D#5 e, B4 e",
    // Bar 21: the forte return, held
    "B5 h.",
  ].join(" | "),
  right: [
    [
      // Held chords under the flute; the oboe bars are left to the tune alone
      "E4+G#4 h. | E4+G#4 h. | E4+G#4 q., E4+C#5 q. | E4+G#4 q., E4+G#4 q.",
      "r h. | r h. | r h. | r h.",
      "B#4+D#5 h. | B#4+D#5 h. | B#4+D#5 q., B#4+E5 q. | B#4+D#5 q., B#4+D#5 q.",
      "r h. | r h. | r h. | r h.",
      "B4+D#5 h. | r h. | r h. | r h.",
      "E5+G#5 h.",
    ].join(" | "),
  ],
  left: [
    [
      E, E, E_CSm, E,
      E, E, E_CSm, Gs,
      Gs, Gs, Gs_Eaug, Gs,
      Gs, Gs, Gs_CSm, B,
      B, B, B, B,
      "E2 h.",
    ].join(" | "),
    [
      "r h. | r h. | r h. | r h. | r h. | r h. | r h. | r h. | r h. | r h. | r h. | r h.",
      "r h. | r h. | r h. | r h. | r h. | r h. | r h. | r h.",
      "B2+G#3 h.",
    ].join(" | "),
  ],
};
