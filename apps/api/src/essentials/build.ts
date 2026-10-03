/**
 * Building and checking the Essentials pack's MIDI files. Free of prisma and
 * express so the fetch/generate scripts and the tests can all use it.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";
// @tonejs/midi ships CJS; go through the default export (see src/midi-metadata.ts).
import ToneMidi from "@tonejs/midi";
import {
  BEGINNER_DURATIONS,
  BEGINNER_GRID,
  BEGINNER_RANGE,
  INTERMEDIATE_MAX_NOTES_PER_HAND,
  extractMelody,
  melodyLine,
  simplifyArrangement,
  type ArrangementMeta,
  type ArrangementNote,
} from "@keyboard-sensei/midi-engine";
import { incipitPitches, type EssentialsLevel, type EssentialsPiece } from "./manifest.js";

const { Midi } = ToneMidi;
export type MidiFile = InstanceType<typeof Midi>;

export const ESSENTIALS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../data/midi-library/essentials");
export const ESSENTIALS_INDEX = path.join(ESSENTIALS_DIR, "index.json");

export const sourceFileName = (slug: string): string => `${slug}.source.mid`;
export const levelFileName = (slug: string, level: EssentialsLevel): string => `${slug}-${level}.mid`;

/** One generated version, as recorded in index.json for the seed. */
export interface EssentialsIndexEntry {
  slug: string;
  level: EssentialsLevel;
  file: string;
  noteCount: number;
  durationSec: number;
  /** Semitones the beginner version was moved (0 for other levels). */
  transpose: number;
  /** Seconds of introduction the beginner version leaves out (0 for other levels). */
  shiftSec: number;
  /** 2 when a beginner tune's note values were doubled (see simplifyArrangement). */
  timeScale: 1 | 2;
}

/** Extract one member of a zip archive (stored or deflated entries). */
export function unzipMember(zip: Buffer, member: string): Buffer {
  let eocd = zip.length - 22;
  while (eocd >= 0 && zip.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error("Not a zip archive");
  const count = zip.readUInt16LE(eocd + 10);
  let entry = zip.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    const method = zip.readUInt16LE(entry + 10);
    const compressedSize = zip.readUInt32LE(entry + 20);
    const nameLength = zip.readUInt16LE(entry + 28);
    const extraLength = zip.readUInt16LE(entry + 30);
    const commentLength = zip.readUInt16LE(entry + 32);
    const localHeader = zip.readUInt32LE(entry + 42);
    const name = zip.toString("utf8", entry + 46, entry + 46 + nameLength);
    if (name === member || name.endsWith(`/${member}`)) {
      const dataStart = localHeader + 30 + zip.readUInt16LE(localHeader + 26) + zip.readUInt16LE(localHeader + 28);
      const data = zip.subarray(dataStart, dataStart + compressedSize);
      if (method === 0) return Buffer.from(data);
      if (method === 8) return inflateRawSync(data);
      throw new Error(`Unsupported zip compression method ${method}`);
    }
    entry += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error(`${member} not found in zip`);
}

/** Track indexes for each hand: the manifest's, else the play-along parser's rule. */
export function handTracks(midi: MidiFile, piece: EssentialsPiece): { right: number[]; left: number[]; melody: number[] } {
  if (piece.tracks) return { ...piece.tracks, melody: piece.tracks.melody ?? [] };
  const withNotes = midi.tracks.map((track, index) => ({ track, index })).filter(({ track }) => track.notes.length > 0);
  if (withNotes.length < 2) return { right: withNotes.map(({ index }) => index), left: [], melody: [] };
  const mean = (t: MidiFile["tracks"][number]): number => t.notes.reduce((sum, note) => sum + note.midi, 0) / t.notes.length;
  const lowest = withNotes.reduce((a, b) => (mean(b.track) < mean(a.track) ? b : a));
  return { right: withNotes.filter(({ index }) => index !== lowest.index).map(({ index }) => index), left: [lowest.index], melody: [] };
}

/**
 * Every note of the source in quarter-note beats (ticks / ppq), with hands and
 * melody marks applied. A single-track source splits into hands at middle C.
 */
export function sourceNotes(midi: MidiFile, piece: EssentialsPiece): ArrangementNote[] {
  const ppq = midi.header.ppq;
  const tracks = handTracks(midi, piece);
  const singleTrack = tracks.left.length === 0;
  const notes: ArrangementNote[] = [];
  for (const [hand, indexes] of [["right", tracks.right], ["left", tracks.left]] as const) {
    for (const index of indexes) {
      for (const note of midi.tracks[index].notes) {
        notes.push({
          midi: note.midi,
          startBeat: note.ticks / ppq,
          durationBeats: note.durationTicks / ppq,
          hand: singleTrack ? (note.midi < 60 ? "left" : "right") : hand,
          velocity: note.velocity,
          ...(tracks.melody.includes(index) ? { melody: true } : {}),
        });
      }
    }
  }
  return notes.sort((a, b) => a.startBeat - b.startBeat || a.midi - b.midi);
}

export function arrangementMeta(midi: MidiFile, piece: EssentialsPiece): ArrangementMeta {
  const ppq = midi.header.ppq;
  const tempos = midi.header.tempos;
  return {
    meters: midi.header.timeSignatures.map((event) => ({
      startBeat: event.ticks / ppq,
      numerator: event.timeSignature[0],
      denominator: event.timeSignature[1],
    })),
    // The MIDI key-signature events in these files are not reliable (minor keys
    // come through under their relative major), so the key is estimated.
    key: null,
    ...(tempos.length > 0 ? { quarterBpm: tempos[0].bpm } : {}),
    ...(piece.melodyStartBeat === undefined ? {} : { melodyStartBeat: piece.melodyStartBeat }),
  };
}

/** Length of the bar containing `beat`, in quarter beats. */
function barStartAtOrBefore(midi: MidiFile, beat: number): number {
  const ppq = midi.header.ppq;
  const segments = midi.header.timeSignatures.length > 0 ? midi.header.timeSignatures : [{ ticks: 0, timeSignature: [4, 4] }];
  let start = 0;
  for (let i = 0; i < segments.length; i++) {
    const segStart = segments[i].ticks / ppq;
    if (segStart > beat + 1e-9) break;
    const [num, den] = segments[i].timeSignature;
    const bar = num * (4 / den);
    const next = i + 1 < segments.length ? segments[i + 1].ticks / ppq : Number.POSITIVE_INFINITY;
    start = segStart + Math.floor((Math.min(beat, next) - segStart) / bar + 1e-9) * bar;
  }
  return start;
}

/**
 * Write `notes` as a two-track (Right hand / Left hand) MIDI that reuses the
 * source's own header — ppq, tempo map, time signatures — so every note lands
 * at exactly the time the original's tempo map puts it.
 *
 * `timeScale` 2 means the notes' beats are original beats × 2 (a beginner tune
 * written in eighths instead of sixteenths): every header event moves to twice
 * its tick, tempos double and meter denominators halve, so it sounds identical.
 * `shiftBeats` (whole bars, original beats) is removed from the front, and the
 * header events shifted with it.
 */
export function writeVersion(source: MidiFile, notes: ArrangementNote[], shiftBeats = 0, timeScale: 1 | 2 = 1): Buffer {
  const out = new Midi();
  out.header.fromJSON(source.header.toJSON());
  const ppq = out.header.ppq;
  if (timeScale !== 1) {
    out.header.tempos = out.header.tempos.map((tempo) => ({ ...tempo, ticks: tempo.ticks * timeScale, bpm: tempo.bpm * timeScale }));
    // Each bar doubles in length: halve the denominator (3/8 → 3/4, 4/4 → 4/2),
    // or, for a half-note beat, double the numerator (2/2 → 4/2, not 2/1).
    out.header.timeSignatures = out.header.timeSignatures.map((event) => {
      const [numerator, denominator] = event.timeSignature;
      return {
        ...event,
        ticks: event.ticks * timeScale,
        timeSignature: denominator >= 4 ? [numerator, denominator / timeScale] : [numerator * timeScale, denominator],
      };
    });
    out.header.keySignatures = out.header.keySignatures.map((event) => ({ ...event, ticks: event.ticks * timeScale }));
    out.header.update();
  }
  const shiftTicks = Math.round(shiftBeats * timeScale * ppq);
  if (shiftTicks > 0) {
    const shiftEvents = <T extends { ticks: number }>(events: T[]): T[] => {
      const before = events.filter((event) => event.ticks <= shiftTicks);
      const kept = before.length > 0 ? [{ ...before[before.length - 1], ticks: 0 }] : [];
      return [...kept, ...events.filter((event) => event.ticks > shiftTicks).map((event) => ({ ...event, ticks: event.ticks - shiftTicks }))];
    };
    out.header.tempos = shiftEvents(out.header.tempos);
    out.header.timeSignatures = shiftEvents(out.header.timeSignatures);
    out.header.keySignatures = shiftEvents(out.header.keySignatures);
    out.header.update();
  }
  for (const [hand, name] of [["right", "Right hand"], ["left", "Left hand"]] as const) {
    const own = notes.filter((note) => note.hand === hand);
    if (own.length === 0) continue;
    const track = out.addTrack();
    track.name = name;
    for (const note of own) {
      track.addNote({
        midi: note.midi,
        ticks: Math.round(note.startBeat * ppq) - shiftTicks,
        durationTicks: Math.max(1, Math.round(note.durationBeats * ppq)),
        velocity: note.velocity ?? 0.7,
      });
    }
  }
  return Buffer.from(out.toArray());
}

export interface BuiltVersion {
  level: EssentialsLevel;
  bytes: Buffer;
  /** Notes as arranged (beats, before any shift). */
  notes: ArrangementNote[];
  transpose: number;
  /** Leading whole bars removed, in original beats (beginner only). */
  shiftBeats: number;
  timeScale: 1 | 2;
}

/** The Full, Intermediate and Beginner versions of one source file. */
export function buildVersions(source: MidiFile, piece: EssentialsPiece): BuiltVersion[] {
  const notes = sourceNotes(source, piece);
  const meta = arrangementMeta(source, piece);
  const versions: BuiltVersion[] = [];
  for (const level of ["full", "intermediate", "beginner"] as const) {
    const result = simplifyArrangement(notes, meta, level);
    // A beginner version has no accompaniment, so a long intro would be silence: start at its first bar.
    const first = Math.min(...result.notes.map((note) => note.startBeat)) / result.timeScale;
    const shiftBeats = level === "beginner" ? barStartAtOrBefore(source, first) : 0;
    versions.push({
      level,
      notes: result.notes,
      transpose: result.transpose,
      shiftBeats,
      timeScale: result.timeScale,
      bytes: writeVersion(source, result.notes, shiftBeats, result.timeScale),
    });
  }
  return versions;
}

// ---------------------------------------------------------------- checks

export interface CheckResult {
  ok: boolean;
  problems: string[];
  /** Melody pitches found at the start of this version (for the report). */
  melodyStart: number[];
}

/**
 * Do the version's opening melody notes reproduce the incipit? The Full
 * version must match it exactly. Simplified versions may have thinned notes
 * out (never added any): their first notes must appear in order within the
 * incipit, starting with its first note, covering at least 75% of it. They
 * may sit whole octaves away from the original (a low theme moved up), and a
 * single note folded into range by an octave still counts as a match.
 */
export function incipitMatches(melody: number[], incipit: number[], exact: boolean): { ok: boolean; matched: number } {
  if (exact) {
    const ok = incipit.every((pitch, i) => melody[i] === pitch);
    return { ok, matched: ok ? incipit.length : 0 };
  }
  if (melody.length === 0 || incipit.length === 0) return { ok: false, matched: 0 };
  const octaveOffset = Math.round((melody[0] - incipit[0]) / 12) * 12;
  let i = 0;
  let matched = 0;
  for (const raw of melody) {
    if (i >= incipit.length) break;
    const pitch = raw - octaveOffset;
    const same = (target: number) => pitch === target || Math.abs(pitch - target) === 12;
    if (matched === 0 && !same(incipit[0])) return { ok: false, matched: 0 };
    while (i < incipit.length && !same(incipit[i])) i++;
    if (i >= incipit.length) break;
    matched++;
    i++;
  }
  return { ok: matched >= Math.ceil(incipit.length * 0.75), matched };
}

/** Most notes of one hand sounding at once (a sweep over note starts and ends). */
const sounding = (notes: ArrangementNote[], hand: "left" | "right"): number => {
  const events: [number, number][] = [];
  for (const note of notes) {
    if (note.hand !== hand) continue;
    events.push([note.startBeat, 1], [note.startBeat + note.durationBeats - 1e-6, -1]);
  }
  // Ends sort before starts at the same instant: touching notes don't overlap.
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let current = 0;
  let max = 0;
  for (const [, delta] of events) {
    current += delta;
    max = Math.max(max, current);
  }
  return max;
};

/**
 * Re-parse a generated file and check it the way the app will see it: the
 * same @tonejs/midi parse the play-along uses, the melody incipit, and the
 * level's structural guarantees. `fullDurationSec` is the Full version's
 * duration; the beginner's removed intro (in seconds) is `shiftSec`.
 */
export function checkVersion(
  source: MidiFile,
  piece: EssentialsPiece,
  level: EssentialsLevel,
  bytes: Buffer,
  transpose: number,
  fullDurationSec: number,
  shiftSec: number,
): CheckResult {
  const problems: string[] = [];
  const midi = new Midi(bytes);
  const ppq = midi.header.ppq;
  const notes: ArrangementNote[] = midi.tracks.flatMap((track) =>
    track.notes.map((note) => ({
      midi: note.midi,
      startBeat: note.ticks / ppq,
      durationBeats: note.durationTicks / ppq,
      hand: track.name === "Left hand" ? ("left" as const) : ("right" as const),
    })),
  );
  if (notes.length === 0) problems.push("no notes");

  const incipit = incipitPitches(piece).map((pitch) => pitch + transpose);
  let melody: number[] = [];
  if (level === "full") {
    // The Full file is the source re-tracked into two hands: nothing may be lost.
    // (Its tune is checked against the source itself, by `fullMelody`.)
    const key = (n: { midi: number; startBeat: number }) => `${n.midi}@${n.startBeat.toFixed(4)}`;
    const want = sourceNotes(source, piece).map(key).sort();
    const got = notes.map(key).sort();
    if (want.length !== got.length || want.some((k, i) => k !== got[i])) problems.push(`full version differs from source (${got.length} vs ${want.length} notes)`);
  } else {
    melody = melodyLine(notes.filter((note) => note.hand === "right")).map((note) => note.midi);
    const match = incipitMatches(melody, incipit, false);
    if (!match.ok) problems.push(`incipit: matched ${match.matched}/${incipit.length}`);
  }

  if (level === "beginner") {
    if (midi.tracks.filter((track) => track.notes.length > 0).length !== 1) problems.push("beginner must be one track");
    const sorted = [...notes].sort((a, b) => a.startBeat - b.startBeat);
    sorted.forEach((note, i) => {
      if (i > 0 && sorted[i - 1].startBeat + sorted[i - 1].durationBeats > note.startBeat + 1e-6) problems.push(`not monophonic at beat ${note.startBeat}`);
      if (note.midi < BEGINNER_RANGE.min || note.midi > BEGINNER_RANGE.max) problems.push(`out of range: ${note.midi}`);
      if (!BEGINNER_DURATIONS.some((d) => Math.abs(d - note.durationBeats) < 1e-6)) problems.push(`rhythm value ${note.durationBeats}`);
      if (Math.abs(note.startBeat / BEGINNER_GRID - Math.round(note.startBeat / BEGINNER_GRID)) > 1e-6) problems.push(`off-grid onset ${note.startBeat}`);
    });
  }
  if (level === "intermediate") {
    for (const hand of ["left", "right"] as const) {
      const max = sounding(notes, hand);
      if (max > INTERMEDIATE_MAX_NOTES_PER_HAND) problems.push(`${hand} hand has ${max} simultaneous notes`);
    }
    if (sounding(notes, "right") > 1) problems.push("right hand is not a single line");
  }

  const expected = fullDurationSec - shiftSec;
  if (level !== "full" && Math.abs(midi.duration - expected) > expected * 0.1) {
    problems.push(`duration ${midi.duration.toFixed(1)}s vs ${expected.toFixed(1)}s`);
  }
  return { ok: problems.length === 0, problems: [...new Set(problems)].slice(0, 6), melodyStart: melody.slice(0, incipit.length) };
}

/**
 * The Full version's tune, read two ways: as the simplified levels read it
 * (`melodyLine`, ornaments removed) and as the raw top voice. A Full version
 * passes if either reproduces the incipit exactly — the raw read is what fits
 * a tune whose opening IS a fast flourish (the Toccata in D minor).
 */
export function fullMelodies(source: MidiFile, piece: EssentialsPiece): number[][] {
  const notes = sourceNotes(source, piece);
  const meta = arrangementMeta(source, piece);
  const marked = notes.filter((note) => note.melody);
  const right = notes.filter((note) => note.hand === "right");
  const pool = (marked.length > 0 ? marked : right.length > 0 ? right : notes).filter(
    (note) => note.startBeat >= (piece.melodyStartBeat ?? 0) - 1e-6,
  );
  return [melodyLine(notes, meta).map((note) => note.midi), extractMelody(pool).map((note) => note.midi)];
}
