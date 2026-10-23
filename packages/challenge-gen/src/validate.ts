import { BEATS_PER_BAR, BARS, TOTAL_BEATS, barRhythms, type ChallengeNote, type ChallengePiece } from "./generate.js";
import { TIER_SHAPE, chordPitchClasses, keyPitchClasses, mod, type Chord } from "./theory.js";

/**
 * Independent checks on a finished piece, in pitches (what the player hears), not in
 * the degrees the generator thinks in. Returns the problems found; [] = valid.
 *
 *   - 8 bars of 4/4; one tune in the right hand
 *   - every note in the key (minor keys may raise the seventh)
 *   - cadences: V at the end of bar 4; V–I into bar 8, the tune ending on the tonic
 *     approached by step from the 2nd or the 7th
 *   - ranges, note lengths and the onset grid of the tier
 *   - strong beats (1 and 3) are chord tones unless they are passing tones
 *   - leaps no wider than the tier allows, each followed by a step back
 *   - one climax, in bars 5–7
 *   - Advanced: no bar rhythm three bars running
 */
export function validatePiece(piece: ChallengePiece): string[] {
  const problems: string[] = [];
  const shape = TIER_SHAPE[piece.tier];
  const melody = piece.notes.filter((note) => note.hand === "right").sort((a, b) => a.startBeat - b.startBeat);
  const left = piece.notes.filter((note) => note.hand === "left");
  const inKey = keyPitchClasses(piece.key);
  const tonicPc = piece.key.tonic;
  const pc = (midi: number) => mod(midi, 12);
  const name = (note: ChallengeNote) => `${note.hand} ${note.midi}@${note.startBeat}`;

  const chordAt = (beat: number) => piece.chords.find((chord) => chord.startBeat <= beat && beat < chord.startBeat + chord.durationBeats);
  const asChord = (chord: { root: number; seventh: boolean }): Chord => ({ root: chord.root as Chord["root"], seventh: chord.seventh });

  // Form
  if (melody.length === 0) problems.push("no tune");
  for (const note of piece.notes) {
    if (note.startBeat < 0 || note.startBeat + note.durationBeats > TOTAL_BEATS + 1e-9) problems.push(`${name(note)} outside the 8 bars`);
  }
  const covered = piece.chords.reduce((sum, chord) => sum + chord.durationBeats, 0);
  if (covered !== TOTAL_BEATS) problems.push(`chords cover ${covered} beats`);

  // Key
  for (const note of piece.notes) if (!inKey.has(pc(note.midi))) problems.push(`${name(note)} out of key`);

  // Cadences
  const lastChordOfBar = (bar: number) => chordAt(bar * BEATS_PER_BAR + BEATS_PER_BAR - 0.5);
  if (chordAt(0)?.root !== 0) problems.push("does not start on I");
  if (lastChordOfBar(3)?.root !== 4) problems.push("bar 4 does not end on V");
  if (lastChordOfBar(6)?.root !== 4 || chordAt(7 * BEATS_PER_BAR)?.root !== 0) problems.push("no V–I cadence into bar 8");
  const final = melody[melody.length - 1];
  const approach = melody[melody.length - 2];
  if (final && approach) {
    if (pc(final.midi) !== tonicPc) problems.push("tune does not end on the tonic");
    if (final.startBeat !== 7 * BEATS_PER_BAR) problems.push("final tonic is not on bar 8's downbeat");
    const fromBelow = final.midi - approach.midi;
    if (Math.abs(fromBelow) < 1 || Math.abs(fromBelow) > 2) problems.push("final tonic is not approached by step");
  }
  const halfCadenceNote = melody.find((note) => note.startBeat <= 14 && 14 < note.startBeat + note.durationBeats);
  const dominant = chordPitchClasses({ root: 4, seventh: false }, piece.key);
  if (!halfCadenceNote || !dominant.includes(pc(halfCadenceNote.midi))) problems.push("bar 4's half cadence is not on a V chord tone");

  // Ranges
  for (const note of melody) {
    if (note.midi < shape.rightHand.min || note.midi > shape.rightHand.max) problems.push(`${name(note)} outside the right-hand range`);
  }
  if (!shape.leftHand && left.length > 0) problems.push("left hand in a right-hand-only tier");
  if (shape.leftHand) {
    for (const note of left) {
      if (note.midi < shape.leftHand.min || note.midi > shape.leftHand.max) problems.push(`${name(note)} outside the left-hand range`);
    }
    if (left.length === 0) problems.push("no left hand");
  }

  // Rhythm
  for (const note of melody) {
    if (Math.abs(note.startBeat / shape.grid - Math.round(note.startBeat / shape.grid)) > 1e-9) problems.push(`${name(note)} off the ${shape.grid}-beat grid`);
    const allowed = piece.tier === 3 ? note.durationBeats % 0.25 === 0 && note.durationBeats <= 4 : shape.durations.includes(note.durationBeats);
    if (!allowed) problems.push(`${name(note)} lasts ${note.durationBeats} beats`);
  }
  for (let i = 1; i < melody.length; i++) {
    if (melody[i]!.startBeat < melody[i - 1]!.startBeat + melody[i - 1]!.durationBeats - 1e-9) problems.push(`tune overlaps at ${melody[i]!.startBeat}`);
  }
  if (piece.tier === 3) {
    const bars = barRhythms(melody.map((note) => note.startBeat));
    for (let bar = 2; bar < BARS; bar++) {
      if (bars[bar] === bars[bar - 1] && bars[bar] === bars[bar - 2]) problems.push(`bar rhythm repeated three times by bar ${bar + 1}`);
    }
  }

  // Strong beats
  for (let beat = 0; beat < TOTAL_BEATS; beat += 2) {
    const index = melody.findIndex((note) => note.startBeat <= beat && beat < note.startBeat + note.durationBeats);
    const chord = chordAt(beat);
    if (index < 0 || !chord) continue;
    const note = melody[index]!;
    if (chordPitchClasses(asChord(chord), piece.key).includes(pc(note.midi))) continue;
    const before = melody[index - 1];
    const after = melody[index + 1];
    const into = before ? note.midi - before.midi : 0;
    const out = after ? after.midi - note.midi : 0;
    const passing = note.startBeat === beat && Math.abs(into) >= 1 && Math.abs(into) <= 2 && Math.abs(out) >= 1 && Math.abs(out) <= 2 && Math.sign(into) === Math.sign(out);
    if (!passing) problems.push(`dissonance on beat ${beat}: ${note.midi} against ${chord.numeral}`);
  }
  // The natural seventh against a major V in minor.
  if (piece.key.mode === "minor") {
    const naturalSeventh = mod(tonicPc + 10, 12);
    for (const note of melody) {
      if (pc(note.midi) === naturalSeventh && chordAt(note.startBeat)?.root === 4) problems.push(`${name(note)} clashes with V's leading tone`);
    }
  }

  // Leaps
  for (let i = 1; i < melody.length; i++) {
    const step = melody[i]!.midi - melody[i - 1]!.midi;
    if (Math.abs(step) > shape.maxLeap) problems.push(`leap of ${step} semitones at ${melody[i]!.startBeat}`);
    if (Math.abs(step) >= 5) {
      const next = melody[i + 1];
      const back = next ? next.midi - melody[i]!.midi : 0;
      if (!next || Math.abs(back) < 1 || Math.abs(back) > 2 || Math.sign(back) === Math.sign(step)) {
        problems.push(`leap at ${melody[i]!.startBeat} is not followed by a step back`);
      }
    }
  }

  // Climax
  const top = Math.max(...melody.map((note) => note.midi));
  const peaks = melody.filter((note) => note.midi === top);
  if (peaks.length !== 1) problems.push(`climax ${top} occurs ${peaks.length} times`);
  else if (peaks[0]!.startBeat < 4 * BEATS_PER_BAR || peaks[0]!.startBeat >= 7 * BEATS_PER_BAR) problems.push(`climax at beat ${peaks[0]!.startBeat}, not in bars 5–7`);

  return problems;
}
