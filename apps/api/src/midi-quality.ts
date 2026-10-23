// @tonejs/midi ships CJS; go through the default export (see src/midi-metadata.ts).
import ToneMidi from "@tonejs/midi";
import { measureDifficultyFeatures } from "./midi-metadata.js";

const { Midi } = ToneMidi;
type MidiFile = InstanceType<typeof Midi>;

export type QualityTier = "verified" | "good" | "unrated" | "low";

/** Share of note onsets that must sit on the grid for a file to count as score-like. */
export const QUANT_GOOD = 0.85;
export const QUANT_VERIFIED = 0.95;
/** Below this the timing is a live performance, not a score. */
export const QUANT_LOW = 0.6;
export const MIN_GOOD_DURATION_S = 30;
export const MAX_GOOD_DURATION_S = 15 * 60;
/** Tracks whose mean pitch differs by this many semitones count as two hands. */
const HAND_SPLIT_SEMITONES = 7;

const PIANO_MIN = 21; // A0
const PIANO_MAX = 108; // C8

export type FileLicence = "public-domain" | "cc-by" | "cc-by-sa" | "cc-by-nc" | "unknown";

/** Facts about the file that the bytes alone cannot tell us. All optional. */
export interface QualityContext {
  /** Essentials pipeline, an authored piece, or a pinned piano-midi.de / Mutopia source. */
  curated?: boolean;
  /** Hand-authored piece: may be a single hand and may be short. */
  authored?: boolean;
  /** A deliberate single-hand melody (an Essentials Beginner version): no hand split expected. */
  singleHandOk?: boolean;
  /** Result of the Essentials melody-incipit assertion against a second source. */
  incipitCheck?: "pass" | "fail" | "none";
  fileLicence?: FileLicence;
  /** The Work is pd-worldwide or pd-us-eu. */
  workPublicDomain?: boolean;
  /**
   * `complete`: composer, canonical title and Work known. `pending`: awaiting
   * review (the default, so an unclassified import is not penalised twice).
   * `incomplete`: reviewed and still missing.
   */
  metadata?: "complete" | "pending" | "incomplete";
  /** A reviewer approved it (curation_status = published). */
  reviewerApproved?: boolean;
  /** Public build: an unknown licence is then Low. */
  publicBuild?: boolean;
  /** Flagged by an admin as lieder, orchestral reduction etc. */
  nonPiano?: boolean;
  duplicateOfVerified?: boolean;
}

export interface QualitySignals {
  quant: number;
  handSplit: boolean;
  noteTracks: number;
  pedal: boolean;
  tempoEvents: number;
  timeSigEvents: number;
  /** Share of notes inside A0-C8. */
  inRange: number;
  durationSec: number;
  noteCount: number;
  notesPerSec: number;
  peakNotesPerSec: number;
  chordSize: number;
  rangeSemitones: number;
}

export interface QualityResult {
  tier: QualityTier;
  /** 0-100, orders songs within a tier. */
  score: number;
  /** Why the file is not better than it is (empty for Verified). */
  reasons: string[];
  /** Null when the file does not parse. */
  signals: QualitySignals | null;
}

const mean = (values: number[]): number => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);

/**
 * Share of onsets within 1/48 beat of a 16th-note or 8th-triplet grid.
 * Score-like files sit near 1; live performances land well under 0.6.
 * Notes on 32nd, 16th-triplet or quintuplet grids count as off-grid, as the
 * library spec defines the signal.
 */
export function measureQuantization(onsetTicks: number[], ppq: number): number {
  if (onsetTicks.length === 0) return 0;
  const tolerance = Math.max(1, ppq / 48);
  const near = (ticks: number, grid: number): boolean => {
    const remainder = ticks % grid;
    return Math.min(remainder, grid - remainder) <= tolerance;
  };
  let onGrid = 0;
  for (const ticks of onsetTicks) {
    if (near(ticks, ppq / 4) || near(ticks, ppq / 3)) onGrid += 1;
  }
  return onGrid / onsetTicks.length;
}

const NAMED_HAND = /\b(right|left)\b/i;

export function measureSignals(midi: MidiFile): QualitySignals | null {
  const tracks = midi.tracks.filter((track) => track.notes.length > 0);
  const notes = tracks.flatMap((track) => track.notes);
  if (notes.length === 0) return null;

  const centres = tracks.map((track) => mean(track.notes.map((note) => note.midi))).sort((a, b) => a - b);
  const pitchSplit = tracks.length >= 2 && centres[centres.length - 1]! - centres[0]! >= HAND_SPLIT_SEMITONES;
  const namedHands =
    tracks.some((track) => /\bright\b/i.test(track.name)) && tracks.some((track) => /\bleft\b/i.test(track.name));

  const durationSec = midi.duration;
  const pianoNotes = notes.filter((note) => note.midi >= PIANO_MIN && note.midi <= PIANO_MAX);
  const difficulty = measureDifficultyFeatures(pianoNotes.length > 0 ? pianoNotes : notes, Math.max(durationSec, 1));

  return {
    quant: measureQuantization(
      notes.map((note) => note.ticks),
      midi.header.ppq,
    ),
    handSplit: pitchSplit || (namedHands && tracks.length >= 2),
    noteTracks: tracks.length,
    pedal: midi.tracks.some((track) => (track.controlChanges[64] ?? []).length > 0),
    tempoEvents: midi.header.tempos.length,
    timeSigEvents: midi.header.timeSignatures.length,
    inRange: pianoNotes.length / notes.length,
    durationSec,
    noteCount: notes.length,
    notesPerSec: difficulty.notesPerSec,
    peakNotesPerSec: difficulty.peakNotesPerSec,
    chordSize: difficulty.chordSize,
    rangeSemitones: difficulty.rangeSemitones,
  };
}

const FREE_LICENCES: FileLicence[] = ["public-domain", "cc-by", "cc-by-sa"];

function qualityScore(signals: QualitySignals, context: QualityContext): number {
  const metadataComplete = context.metadata === "complete";
  const idealLength = signals.durationSec >= 45 && signals.durationSec <= 8 * 60;
  const score =
    40 * Math.min(1, signals.quant / QUANT_VERIFIED) +
    (signals.handSplit ? 20 : 0) +
    (metadataComplete ? 10 : 0) +
    (idealLength ? 10 : 0) +
    (signals.timeSigEvents > 0 ? 10 : 0) +
    (context.curated || context.authored ? 10 : 0);
  return Math.round(score * 10) / 10;
}

/**
 * Classify a MIDI file into Verified / Good / Unrated / Low from measurable
 * signals plus what the caller knows about provenance. Pure and deterministic:
 * the same bytes and context always give the same result.
 *
 * Verified needs facts no measurement can supply (incipit check, reviewer
 * approval), so without a context the best a file can be is Good.
 */
export function classifyMidiQuality(bytes: Uint8Array, context: QualityContext = {}): QualityResult {
  let midi: MidiFile;
  try {
    midi = new Midi(bytes);
  } catch {
    return { tier: "low", score: 0, reasons: ["unparseable"], signals: null };
  }
  const signals = measureSignals(midi);
  if (!signals) return { tier: "low", score: 0, reasons: ["no-notes"], signals: null };

  const singleHandOk = context.authored === true || context.singleHandOk === true;
  const mayBeShort = context.authored === true || context.curated === true;
  const score = qualityScore(signals, context);
  const lowReasons: string[] = [];
  if (signals.quant < QUANT_LOW) lowReasons.push("performance-timing");
  if (signals.durationSec < MIN_GOOD_DURATION_S && !mayBeShort) lowReasons.push("fragment");
  if (context.nonPiano) lowReasons.push("non-piano");
  if (context.duplicateOfVerified) lowReasons.push("duplicate-of-verified");
  if (context.publicBuild && (context.fileLicence ?? "unknown") === "unknown") lowReasons.push("unknown-licence");
  if (lowReasons.length > 0) return { tier: "low", score, reasons: lowReasons, signals };

  const gaps: string[] = [];
  if (signals.quant < QUANT_GOOD) gaps.push("partly-unquantised");
  if (!signals.handSplit && !singleHandOk) gaps.push(signals.noteTracks === 1 ? "single-track" : "no-hand-split");
  if (signals.durationSec > MAX_GOOD_DURATION_S) gaps.push("very-long");
  if (context.metadata === "incomplete") gaps.push("metadata-incomplete");
  if (gaps.length > 0) return { tier: "unrated", score, reasons: gaps, signals };

  const verifiedBlockers: string[] = [];
  if (!(context.curated || context.authored)) verifiedBlockers.push("source-not-curated");
  if (context.incipitCheck !== "pass") verifiedBlockers.push("incipit-not-checked");
  if (signals.quant < QUANT_VERIFIED) verifiedBlockers.push("quant-below-0.95");
  if (!signals.handSplit && !singleHandOk) verifiedBlockers.push("no-hand-split");
  if (!FREE_LICENCES.includes(context.fileLicence ?? "unknown")) verifiedBlockers.push("licence-not-free");
  if (context.workPublicDomain !== true) verifiedBlockers.push("work-not-public-domain");
  if (context.metadata !== "complete") verifiedBlockers.push("metadata-not-complete");
  if (context.reviewerApproved !== true) verifiedBlockers.push("not-approved");

  if (verifiedBlockers.length === 0) return { tier: "verified", score, reasons: [], signals };
  return { tier: "good", score, reasons: verifiedBlockers, signals };
}
