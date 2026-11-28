import { centsBetween, HIGHEST_PIANO_MIDI, LOWEST_PIANO_MIDI, shiftCents } from "./dsp.js";
import { computeTuningCurve, sampleNotesForCurve, tuningOrder, typicalStringsPerNote, type TuningCurve } from "./curve.js";
import { adviseForPitchLevel, deviationAt, overpullCents, pitchLevelCents, type PitchLevelAdvice } from "./pitchRaise.js";
import type { PianoNoteMeasurement } from "./types.js";

/**
 * Guided tuning flow (spec 6.2) as a pure reducer, so the UI, persistence and
 * tests all share one source of truth.
 *
 * Nothing is guided before the safety note (spec 6.3) has been acknowledged in
 * this session: until then every action except ACKNOWLEDGE_SAFETY is ignored.
 * The acknowledgement is never persisted, so a resumed session asks again.
 */

export type FlowPhase = "measure" | "plan" | "tune" | "done";
export type TuningMode = "fine" | "pitch-raise" | "own-pitch";
export type TuningPass = "rough" | "fine";
export type Substep =
  | "rough"
  | "mute"
  | "centre"
  | "first"
  | "single"
  | "unison-left"
  | "unison-right"
  | "unison"
  | "octave";
export type StopReason = "will-not-hold" | "pin-too-loose" | "pitch-jumps" | "other";

export interface NoteProgress {
  status: "pending" | "done" | "stopped" | "skipped";
  finalCents?: number;
  stopReason?: StopReason;
}

export interface SampleResult {
  midi: number;
  inharmonicityB: number;
  pitchHz: number;
  confidence: number;
}

export interface LiveState {
  cents: number | null;
  atMs: number | null;
  reached: boolean;
  heldCents: number | null;
  driftEvents: number;
  jumpEvents: number;
}

export interface TuningSession {
  version: 1;
  acknowledged: boolean;
  phase: FlowPhase;
  /** Reference pitch the owner chose. */
  a4Hz: number;
  /** Reference the curve is built at (lower than `a4Hz` in own-pitch mode). */
  tuneA4Hz: number;
  lowestMidi: number;
  highestMidi: number;
  sampleNotes: number[];
  measureIndex: number;
  samples: SampleResult[];
  mode: TuningMode | null;
  pass: TuningPass;
  order: number[];
  index: number;
  substep: Substep;
  stringsOverride: Record<number, 1 | 2 | 3>;
  notes: Record<number, NoteProgress>;
  live: LiveState;
  stopNotice: { midi: number; reason: StopReason } | null;
}

export type FlowAction =
  | { type: "ACKNOWLEDGE_SAFETY"; understood: boolean }
  | { type: "SET_REFERENCE"; a4Hz: number }
  | { type: "SET_RANGE"; lowestMidi: number; highestMidi: number }
  | { type: "RECORD_SAMPLE"; measurement: PianoNoteMeasurement }
  | { type: "SKIP_SAMPLE" }
  | { type: "REDO_SAMPLE" }
  | { type: "FINISH_MEASURE" }
  | { type: "CHOOSE_MODE"; mode: TuningMode }
  | { type: "READING"; cents: number; atMs: number }
  | { type: "NEXT_SUBSTEP" }
  | { type: "SKIP_NOTE" }
  | { type: "REPORT_PROBLEM"; reason: StopReason }
  | { type: "DISMISS_STOP_NOTICE" }
  | { type: "SET_STRINGS"; midi: number; strings: 1 | 2 | 3 };

/** Fine display tolerance (spec: +/- 1 cent). */
export const FINE_TOLERANCE_CENTS = 1;
export const ROUGH_TOLERANCE_CENTS = 5;
/** A reading that changes this much within `JUMP_WINDOW_MS` counts as a jump. */
export const JUMP_CENTS = 20;
export const JUMP_WINDOW_MS = 500;
export const JUMPS_TO_STOP = 3;
/** A settled note creeping this far flat counts as not holding. */
export const DRIFT_CENTS = 3;
export const DRIFTS_TO_STOP = 2;
/** Below this the reading is moving because someone is turning the pin, not drifting. */
const ADJUSTING_STEP_CENTS = 1.5;
/** Samples below this confidence are not used for the curve. */
export const MIN_SAMPLE_CONFIDENCE = 0.3;

const FRESH_LIVE: LiveState = { cents: null, atMs: null, reached: false, heldCents: null, driftEvents: 0, jumpEvents: 0 };

export function createSession(options: { a4Hz?: number; lowestMidi?: number; highestMidi?: number } = {}): TuningSession {
  const lowestMidi = options.lowestMidi ?? LOWEST_PIANO_MIDI;
  const highestMidi = options.highestMidi ?? HIGHEST_PIANO_MIDI;
  const a4Hz = options.a4Hz ?? 440;
  return {
    version: 1,
    acknowledged: false,
    phase: "measure",
    a4Hz,
    tuneA4Hz: a4Hz,
    lowestMidi,
    highestMidi,
    sampleNotes: sampleNotesForCurve(lowestMidi, highestMidi),
    measureIndex: 0,
    samples: [],
    mode: null,
    pass: "fine",
    order: [],
    index: 0,
    substep: "single",
    stringsOverride: {},
    notes: {},
    live: { ...FRESH_LIVE },
    stopNotice: null,
  };
}

export function curveForSession(session: TuningSession): TuningCurve {
  return computeTuningCurve(
    session.samples.filter((s) => s.confidence >= MIN_SAMPLE_CONFIDENCE),
    { a4Hz: session.tuneA4Hz, lowestMidi: session.lowestMidi, highestMidi: session.highestMidi },
  );
}

export interface PlanSummary {
  /** Median deviation of the measured notes from this piano's stretch curve at the chosen A4. */
  pitchLevelCents: number;
  advice: PitchLevelAdvice;
  deviations: { midi: number; cents: number }[];
  usableSamples: number;
}

export function planSummary(session: TuningSession): PlanSummary {
  const usable = session.samples.filter((s) => s.confidence >= MIN_SAMPLE_CONFIDENCE);
  const curve = computeTuningCurve(usable, { a4Hz: session.a4Hz, lowestMidi: session.lowestMidi, highestMidi: session.highestMidi });
  const deviations = usable
    .filter((s) => curve.targets[s.midi])
    .map((s) => ({ midi: s.midi, cents: centsBetween(s.pitchHz, curve.targets[s.midi].targetHz) }));
  const level = pitchLevelCents(deviations.map((d) => d.cents));
  return { pitchLevelCents: level, advice: adviseForPitchLevel(level), deviations, usableSamples: usable.length };
}

export function stringsFor(session: TuningSession, midi: number): 1 | 2 | 3 {
  return session.stringsOverride[midi] ?? typicalStringsPerNote(midi);
}

export function substepsFor(session: TuningSession, midi: number, curve: TuningCurve): Substep[] {
  if (session.pass === "rough") return ["rough"];
  const strings = stringsFor(session, midi);
  const steps: Substep[] =
    strings === 3 ? ["mute", "centre", "unison-left", "unison-right"] : strings === 2 ? ["mute", "first", "unison"] : ["single"];
  const partner = curve.targets[midi]?.partnerMidi;
  if (partner !== undefined && session.notes[partner]?.status === "done") steps.push("octave");
  return steps;
}

/** Substeps where the live pitch reading is the guide (one string sounding). */
export function isPitchSubstep(step: Substep): boolean {
  return step === "rough" || step === "centre" || step === "first" || step === "single";
}

export interface CurrentTarget {
  midi: number;
  /** Final target pitch from the curve. */
  targetHz: number;
  /** What to aim for now (target plus overpull in the rough pass). */
  aimHz: number;
  overpullCents: number;
  toleranceCents: number;
  listenPartial: number;
  inharmonicityB: number;
  partnerMidi?: number;
  strings: 1 | 2 | 3;
  substeps: Substep[];
}

export function currentTarget(session: TuningSession, curve: TuningCurve = curveForSession(session)): CurrentTarget | null {
  if (session.phase !== "tune") return null;
  const midi = session.order[session.index];
  const t = midi === undefined ? undefined : curve.targets[midi];
  if (!t) return null;
  let over = 0;
  if (session.pass === "rough") {
    const devs = planSummary(session).deviations;
    over = overpullCents(deviationAt(devs, midi), midi);
  }
  return {
    midi,
    targetHz: t.targetHz,
    aimHz: shiftCents(t.targetHz, over),
    overpullCents: over,
    toleranceCents: session.pass === "rough" ? ROUGH_TOLERANCE_CENTS : FINE_TOLERANCE_CENTS,
    listenPartial: t.listenPartial,
    inharmonicityB: t.inharmonicityB,
    partnerMidi: t.partnerMidi,
    strings: stringsFor(session, midi),
    substeps: substepsFor(session, midi, curve),
  };
}

function firstSubstep(session: TuningSession, index: number): Substep {
  const midi = session.order[index];
  if (midi === undefined) return "single";
  return substepsFor(session, midi, curveForSession(session))[0];
}

/** Moves to the next note that still needs tuning in this pass, or on to the fine pass / done. */
function advanceNote(session: TuningSession): TuningSession {
  let index = session.index + 1;
  const pending = (i: number) => {
    const st = session.notes[session.order[i]]?.status;
    return st !== "stopped";
  };
  while (index < session.order.length && !pending(index)) index++;
  if (index < session.order.length) {
    const next = { ...session, index, live: { ...FRESH_LIVE } };
    return { ...next, substep: firstSubstep(next, index) };
  }
  if (session.pass === "rough") {
    // Fine pass over every note that was not stopped.
    const notes: Record<number, NoteProgress> = {};
    for (const [k, v] of Object.entries(session.notes)) if (v.status === "stopped") notes[Number(k)] = v;
    const fine: TuningSession = { ...session, pass: "fine", notes, index: -1 };
    return advanceNote(fine);
  }
  return { ...session, phase: "done", live: { ...FRESH_LIVE } };
}

function onReading(session: TuningSession, cents: number, atMs: number): TuningSession {
  const live = { ...session.live };
  const tolerance = session.pass === "rough" ? ROUGH_TOLERANCE_CENTS : FINE_TOLERANCE_CENTS;
  const prev = live.cents;
  const prevAt = live.atMs;
  live.cents = cents;
  live.atMs = atMs;
  if (!isPitchSubstep(session.substep)) return { ...session, live };

  if (prev !== null && prevAt !== null && atMs - prevAt <= JUMP_WINDOW_MS && Math.abs(cents - prev) > JUMP_CENTS) {
    live.jumpEvents++;
  }
  const inTol = Math.abs(cents) <= tolerance;
  if (prev !== null && Math.abs(cents - prev) > ADJUSTING_STEP_CENTS) {
    // Someone is turning the pin: restart the hold check from here.
    live.reached = inTol;
    live.heldCents = inTol ? cents : null;
  } else if (!live.reached && inTol) {
    live.reached = true;
    live.heldCents = cents;
  } else if (live.reached && live.heldCents !== null && cents < live.heldCents - DRIFT_CENTS) {
    live.driftEvents++;
    live.reached = false;
    live.heldCents = null;
  }
  const next = { ...session, live };
  if (live.jumpEvents >= JUMPS_TO_STOP) return stopNote(next, "pitch-jumps");
  if (live.driftEvents >= DRIFTS_TO_STOP) return stopNote(next, "will-not-hold");
  return next;
}

function stopNote(session: TuningSession, reason: StopReason): TuningSession {
  const midi = session.order[session.index];
  return {
    ...session,
    notes: { ...session.notes, [midi]: { status: "stopped", stopReason: reason } },
    stopNotice: { midi, reason },
  };
}

export function tuningReducer(session: TuningSession, action: FlowAction): TuningSession {
  if (!session.acknowledged) {
    if (action.type === "ACKNOWLEDGE_SAFETY" && action.understood) return { ...session, acknowledged: true };
    return session;
  }
  // While a stop notice is showing, the note is not guided any further.
  if (session.stopNotice && action.type !== "DISMISS_STOP_NOTICE") return session;

  switch (action.type) {
    case "ACKNOWLEDGE_SAFETY":
      return session;
    case "SET_REFERENCE": {
      if (session.phase !== "measure" && session.phase !== "plan") return session;
      const a4Hz = Math.min(466, Math.max(415, action.a4Hz));
      return { ...session, a4Hz, tuneA4Hz: a4Hz };
    }
    case "SET_RANGE": {
      if (session.phase !== "measure" || session.samples.length) return session;
      const lowestMidi = Math.max(LOWEST_PIANO_MIDI, Math.min(action.lowestMidi, 57));
      const highestMidi = Math.min(HIGHEST_PIANO_MIDI, Math.max(action.highestMidi, 69));
      return { ...session, lowestMidi, highestMidi, sampleNotes: sampleNotesForCurve(lowestMidi, highestMidi), measureIndex: 0 };
    }
    case "RECORD_SAMPLE": {
      if (session.phase !== "measure") return session;
      const midi = session.sampleNotes[session.measureIndex];
      const m = action.measurement;
      if (midi === undefined || m.midi !== midi) return session;
      const samples = [
        ...session.samples.filter((s) => s.midi !== midi),
        { midi, inharmonicityB: m.inharmonicityB, pitchHz: m.pitchHz, confidence: m.confidence },
      ];
      return { ...session, samples, measureIndex: session.measureIndex + 1 };
    }
    case "SKIP_SAMPLE":
      if (session.phase !== "measure") return session;
      return { ...session, measureIndex: Math.min(session.sampleNotes.length, session.measureIndex + 1) };
    case "REDO_SAMPLE":
      if (session.phase !== "measure") return session;
      return { ...session, measureIndex: Math.max(0, session.measureIndex - 1) };
    case "FINISH_MEASURE":
      if (session.phase !== "measure") return session;
      return { ...session, phase: "plan" };
    case "CHOOSE_MODE": {
      if (session.phase !== "plan") return session;
      const plan = planSummary(session);
      if (action.mode === "pitch-raise" && plan.advice === "professional") return session;
      const tuneA4Hz = action.mode === "own-pitch" ? shiftCents(session.a4Hz, Math.min(0, plan.pitchLevelCents)) : session.a4Hz;
      const base: TuningSession = {
        ...session,
        mode: action.mode,
        tuneA4Hz,
        pass: action.mode === "pitch-raise" ? "rough" : "fine",
        phase: "tune",
        order: tuningOrder(session.lowestMidi, session.highestMidi),
        index: 0,
        notes: {},
        live: { ...FRESH_LIVE },
      };
      return { ...base, substep: firstSubstep(base, 0) };
    }
    case "READING":
      if (session.phase !== "tune") return session;
      return onReading(session, action.cents, action.atMs);
    case "NEXT_SUBSTEP": {
      if (session.phase !== "tune") return session;
      const target = currentTarget(session);
      if (!target) return session;
      const at = target.substeps.indexOf(session.substep);
      if (at >= 0 && at < target.substeps.length - 1) {
        const substep = target.substeps[at + 1];
        return { ...session, substep, live: { ...FRESH_LIVE, cents: session.live.cents, atMs: session.live.atMs } };
      }
      const done: NoteProgress = { status: "done", finalCents: session.live.cents ?? undefined };
      return advanceNote({ ...session, notes: { ...session.notes, [target.midi]: done } });
    }
    case "SKIP_NOTE": {
      if (session.phase !== "tune") return session;
      const midi = session.order[session.index];
      return advanceNote({ ...session, notes: { ...session.notes, [midi]: { status: "skipped" } } });
    }
    case "REPORT_PROBLEM":
      if (session.phase !== "tune") return session;
      return stopNote(session, action.reason);
    case "DISMISS_STOP_NOTICE":
      if (!session.stopNotice) return session;
      return advanceNote({ ...session, stopNotice: null });
    case "SET_STRINGS": {
      if (session.phase !== "tune" || session.order[session.index] !== action.midi) return session;
      const next = { ...session, stringsOverride: { ...session.stringsOverride, [action.midi]: action.strings } };
      return { ...next, substep: firstSubstep(next, session.index), live: { ...FRESH_LIVE } };
    }
  }
}

export interface SessionSummary {
  done: number;
  skipped: number;
  stopped: { midi: number; reason: StopReason }[];
  /** True when any note was stopped or the plan advised a professional: the UI recommends a technician. */
  recommendTechnician: boolean;
}

export function summarizeSession(session: TuningSession): SessionSummary {
  const entries = Object.entries(session.notes).map(([k, v]) => ({ midi: Number(k), ...v }));
  const stopped = entries.filter((e) => e.status === "stopped").map((e) => ({ midi: e.midi, reason: e.stopReason ?? "other" }));
  return {
    done: entries.filter((e) => e.status === "done").length,
    skipped: entries.filter((e) => e.status === "skipped").length,
    stopped,
    recommendTechnician: stopped.length > 0 || (session.samples.length > 0 && planSummary(session).advice === "professional"),
  };
}

/** Prepares a session for storage: the safety acknowledgement is never saved. */
export function serializeSession(session: TuningSession): string {
  return JSON.stringify({ ...session, acknowledged: false, stopNotice: session.stopNotice });
}

export function parseSession(raw: string | null): TuningSession | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as TuningSession;
    if (parsed?.version !== 1 || !Array.isArray(parsed.sampleNotes)) return null;
    return { ...parsed, acknowledged: false, live: { ...FRESH_LIVE } };
  } catch {
    return null;
  }
}
