import type { ExpectedNoteEvent, MidiExercise, PerformedNote, ScoringMistake, ScoringResult } from "@keyboard-sensei/shared-types";
import { midiNoteToName } from "@keyboard-sensei/music-theory";
import { resolveScoreWeights } from "./config.js";

export interface ScoreMidiExerciseParams { exercise: MidiExercise; performedNotes: PerformedNote[]; durationTolerancePercent?: number }
const round = (value: number) => Math.round(Math.max(0, Math.min(100, value)));

export function scoreMidiExercise({ exercise, performedNotes, durationTolerancePercent }: ScoreMidiExerciseParams): ScoringResult {
  const msPerBeat = 60_000 / exercise.tempoBpm;
  const expected = [...exercise.expected].sort((a, b) => a.startBeat - b.startBeat);
  const performed = [...performedNotes].sort((a, b) => a.startTimestampMs - b.startTimestampMs);
  const origin = performed[0]?.startTimestampMs ?? 0;
  const firstBeat = expected[0]?.startBeat ?? 0;
  const targetTime = (note: ExpectedNoteEvent) => origin + (note.startBeat - firstBeat) * msPerBeat;
  const tolerancePercent = durationTolerancePercent ?? exercise.durationTolerancePercent;
  const mistakes: ScoringMistake[] = [];
  const feedback = new Set<string>();
  const used = new Set<number>();
  let pitchHits = 0, timingHits = 0, durationKnown = 0, durationHits = 0;

  const groups = new Map<string, ExpectedNoteEvent[]>();
  const singles: ExpectedNoteEvent[] = [];
  for (const note of expected) note.chordGroupId ? groups.set(note.chordGroupId, [...(groups.get(note.chordGroupId) ?? []), note]) : singles.push(note);
  let chordHits = 0;

  const add = (expectedNote: ExpectedNoteEvent | null, performedNote: PerformedNote | null, issue: ScoringMistake["issue"], chordGroupId = expectedNote?.chordGroupId ?? null) => mistakes.push({ noteId: expectedNote?.id ?? null, expectedNote: expectedNote?.note ?? null, performedNote: performedNote?.note ?? null, chordGroupId, issue });
  const scoreDuration = (exp: ExpectedNoteEvent, got: PerformedNote) => {
    if (got.durationMs === null) { add(exp, got, "duration-unknown"); feedback.add(`Duration was unavailable for ${midiNoteToName(exp.note)}.`); return }
    durationKnown++;
    const target = exp.durationBeats * msPerBeat;
    const error = ((got.durationMs - target) / target) * 100;
    if (Math.abs(error) <= tolerancePercent) durationHits++;
    else if (error < 0) { add(exp, got, "held-too-short"); feedback.add(`Try holding ${midiNoteToName(exp.note)} for its full value.`) }
    else { add(exp, got, "held-too-long"); feedback.add(`${midiNoteToName(exp.note)} was held too long.`) }
  };
  const scoreTiming = (exp: ExpectedNoteEvent, got: PerformedNote) => {
    const delta = got.startTimestampMs - targetTime(exp);
    if (Math.abs(delta) <= exercise.timingToleranceMs) timingHits++;
    else if (delta < 0) { add(exp, got, "early"); feedback.add(`${midiNoteToName(exp.note)} was early.`) }
    else { add(exp, got, "late"); feedback.add(`${midiNoteToName(exp.note)} was late.`) }
  };

  for (const exp of singles) {
    let index = performed.map((got, i) => ({ got, i })).filter(({got,i}) => !used.has(i) && got.note === exp.note).sort((a,b) => Math.abs(a.got.startTimestampMs-targetTime(exp))-Math.abs(b.got.startTimestampMs-targetTime(exp)))[0]?.i ?? -1;
    if (index < 0) index = performed.findIndex((_, i) => !used.has(i) && Math.abs(performed[i]!.startTimestampMs - targetTime(exp)) <= exercise.timingToleranceMs);
    if (index < 0) { add(exp, null, "missed"); feedback.add(`You missed ${midiNoteToName(exp.note)}.`); continue }
    used.add(index); const got = performed[index]!;
    if (got.note === exp.note) pitchHits++; else { add(exp, got, "wrong"); feedback.add(`Expected ${midiNoteToName(exp.note)}, but heard ${midiNoteToName(got.note)}.`) }
    scoreTiming(exp, got); scoreDuration(exp, got);
  }

  for (const [groupId, chord] of groups) {
    const target = targetTime(chord[0]!);
    const candidates = performed.map((note, index) => ({ note, index })).filter(({ note, index }) => !used.has(index) && Math.abs(note.startTimestampMs - target) <= exercise.timingToleranceMs * 2);
    const selected: { note: PerformedNote; index: number }[] = [];
    for (const exp of chord) {
      const match = candidates.find(({ note, index }) => !selected.some((item) => item.index === index) && note.note === exp.note);
      if (match) { selected.push(match); used.add(match.index); pitchHits++; scoreDuration(exp, match.note) }
      else { add(exp, null, "missing-chord-tone", groupId); feedback.add(`The chord was missing ${midiNoteToName(exp.note)}.`) }
    }
    const extras = candidates.filter(({ index }) => !selected.some((item) => item.index === index));
    for (const extra of extras) { used.add(extra.index); add(null, extra.note, "extra-chord-tone", groupId); feedback.add(`The chord contained extra ${midiNoteToName(extra.note.note)}.`) }
    const attacks = selected.map(({ note }) => note.startTimestampMs);
    const spread = attacks.length ? Math.max(...attacks) - Math.min(...attacks) : 0;
    const delta = attacks.length ? attacks.reduce((sum, value) => sum + value, 0) / attacks.length - target : Infinity;
    if (Math.abs(delta) <= exercise.timingToleranceMs) timingHits += selected.length;
    else if (selected.length) { const issue = delta < 0 ? "early" : "late"; add(chord[0]!, selected[0]!.note, issue, groupId); feedback.add(`The chord was ${issue}.`) }
    if (spread > exercise.simultaneityWindowMs) { add(chord[0]!, selected[0]?.note ?? null, "uneven-hand-timing", groupId); feedback.add("The chord was uneven; play its notes together.") }
    if (selected.length === chord.length && extras.length === 0 && spread <= exercise.simultaneityWindowMs && Math.abs(delta) <= exercise.timingToleranceMs) chordHits++;
  }

  performed.forEach((note, index) => { if (!used.has(index)) { add(null, note, "extra"); feedback.add(`Extra note: ${midiNoteToName(note.note)}.`) } });
  const expectedCount = expected.length || 1;
  const noteAccuracy = round((pitchHits / Math.max(expectedCount, expectedCount + performed.length - used.size)) * 100);
  const timingAccuracy = round((timingHits / expectedCount) * 100);
  const rhythmAccuracy = durationKnown === 0 ? (expected.length ? 0 : 100) : round((durationHits / durationKnown) * 100);
  const chordAccuracy = groups.size === 0 ? 100 : round((chordHits / groups.size) * 100);
  const weights = resolveScoreWeights();
  const score = round(noteAccuracy * weights.noteAccuracy + timingAccuracy * weights.timingAccuracy + rhythmAccuracy * weights.rhythmAccuracy + chordAccuracy * weights.chordAccuracy);
  if (!feedback.size && expected.length) feedback.add("Excellent accuracy and timing.");
  return { score, noteAccuracy, timingAccuracy, rhythmAccuracy, chordAccuracy, feedback: [...feedback], mistakes };
}
