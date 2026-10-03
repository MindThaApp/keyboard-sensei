import type { AuthoredScore } from "./notation.js";

/**
 * The Trio of the march (its first, quiet statement, 40 bars), with the tune
 * an octave above Elgar's sul G violins and the bass line and harmony of
 * Lemare's organ transcription (Boosey, 1902), checked against the full score.
 */
// One entry per bar: [tune, inner right-hand voice, bass, left-hand chord].
const bars: [string, string, string, string][] = [
  ["G5 h", "B4+D5 h", "G2", "D3+G3+B3"],
  ["F#5 e, G5 e, A5 q", "F#4+C5 h", "A2", "D3+F#3+C4"],
  ["E5 h", "G4+B4 h", "B2", "E3+G3+B3"],
  ["D5 h", "G4+B4 h", "B2", "D3+G3+B3"],
  ["C5 h", "E4+G4 h", "C3", "E3+G3+C4"],
  ["B4 e, C5 e, D5 q", "D4+G4 h", "D3", "G3+B3"],
  ["A4 h~", "C#4+G4 h", "E3", "G3+A3"],
  ["A4 q., r e", "D4+F#4 q., r e", "D3", "F#3+A3"],
  ["B4 h", "D4+G4 h", "G2", "D3+G3+B3"],
  ["C#5 e, D5 q, E5 e", "E4+A4 h", "G2", "E3+A3+C#4"],
  ["A5 h", "D5+F#5 h", "F#2", "D3+A3+D4"],
  ["D5 h", "F#4+B4 h", "B2", "D3+F#3+B3"],
  ["G5 h", "B4+D5 h", "E2", "D3+G3+B3"],
  ["G5 e, F#5 q, E5 e", "A4+C#5 h", "A2", "E3+G3+C#4"],
  ["D5 h~", "F#4+A4 h", "D3", "F#3+A3+D4"],
  ["D5 q., r e", "F#4+C5 q., r e", "D3", "F#3+A3+D4"],
  ["G5 h", "B4+D5 h", "G2", "D3+G3+B3"],
  ["F#5 e, G5 e, A5 q", "F#4+C5 h", "A2", "D3+F#3+C4"],
  ["E5 h", "G4+B4 h", "B2", "E3+G3+B3"],
  ["D5 h", "G4+B4 h", "B2", "D3+G3+B3"],
  ["C5 h", "E4+G4 h", "E3", "G3+C4"],
  ["B4 e, C5 e, D5 q", "D4+G4 h", "D3", "G3+B3"],
  ["A4 h~", "E4+G4 h", "C#3", "E3+A3"],
  ["A4 h", "D4+F#4 h", "D3", "F#3+A3"],
  ["B4 h", "D4+G4 h", "G2", "D3+G3+B3"],
  ["C#5 e, D5 q, E5 e", "E4+A4 h", "G2", "E3+A3+C#4"],
  ["A5 h", "D5+F#5 h", "F#2", "D3+A3+D4"],
  ["D5 h", "F#4+A4 h", "F#2", "D3+A3"],
  ["C6 h", "E5+G5 h", "E3", "G3+C4+E4"],
  ["C6 e, B5 q, A5 e", "D5+F#5 h", "D3", "F#3+A3+C4"],
  ["B5 h~", "D5+G5 h", "G2", "D3+G3+B3"],
  ["B5 h", "D5+G5 q, D5+F5 q", "G2", "D3+F3+B3"],
  ["E5 h", "G4+C5 h", "C3", "E3+G3+C4"],
  ["F#5 e, G5 q, A5 e", "A4+C5 h", "C3", "D3+F#3+A3"],
  ["D5 h", "G4+B4 h", "B2", "D3+G3+B3"],
  ["G5 h", "B4+E5 h", "E2", "E3+G3+B3"],
  ["G4 h", "C4+E4 h", "A2", "E3+G3+A3"],
  ["C5 e, B4 q, A4 e", "D4+F#4 h", "D2", "D3+F#3+C4"],
  ["G4 h~", "B3+D4 h~", "G2", "D3+G3"],
  ["G4 h", "B3+D4 h", "G2", "D3+G3"],
];

export const pompAndCircumstance1: AuthoredScore = {
  meter: [2, 4],
  bpm: 84,
  melody: bars.map(([tune]) => tune).join(" | "),
  right: [bars.map(([, inner]) => inner).join(" | ")],
  left: [bars.map(([, , bass, chord]) => `${bass} q, ${chord} q`).join(" | ")],
};
