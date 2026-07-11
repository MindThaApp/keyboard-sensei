import { useEffect, useMemo, useRef, useState } from "react";
import type { MidiExercise as MidiExerciseDef, RawMidiEvent, ScoringResult } from "@keyboard-sensei/shared-types";
import { JUDGE_WINDOWS_S, judgeNextPress, pairRawMidiEvents, type PlayAlongJudgment, type PlayAlongNote } from "@keyboard-sensei/midi-engine";
import { midiNoteToName } from "@keyboard-sensei/music-theory";
import { useMidiContext } from "./MidiContext";
import MetronomeControls, { loadMetronomeSettings, saveMetronomeSettings, type MetronomeSettings } from "./MetronomeControls";
import VirtualPiano from "../piano/VirtualPiano";
import NotationRenderer from "../notation/NotationRenderer";
import { useProgressStore } from "../../state/progressStore";
import { metronome } from "../../utils/metronome";
import { groupIntoMeasures, midiToVexKey, type BeatEvent } from "../../utils/measureNotation";

/** Score a lesson exercise must reach for the lesson to count as passed (mirrors the API's threshold). */
export const PASS_SCORE = 70;
const COUNT_IN_BEATS = 4;

interface Props {
  exerciseId: string;
  title: string;
  instructions: string;
  lessonId?: string | null;
  exercise?: MidiExerciseDef;
  onCompleted?: (result: ScoringResult) => void;
}

type Phase = "idle" | "listening" | "counting-in" | "recording" | "submitting" | "scored";

const LIVE_POINTS: Record<PlayAlongJudgment, number> = { perfect: 10, good: 7, ok: 4, miss: -3 };
const WRONG_PRESS_PENALTY = 2;

interface LiveNote extends PlayAlongNote {
  id: string;
}

/** Converts an exercise's beat-based expected notes into song-second-based notes for the live-follow overlay, using whatever tempo is actually being practiced at. */
function liveNotesFor(exercise: MidiExerciseDef, effectiveBpm: number): LiveNote[] {
  const msPerBeat = 60_000 / effectiveBpm;
  const firstBeat = Math.min(...exercise.expected.map((n) => n.startBeat));
  return exercise.expected.map((event) => ({
    id: event.id,
    midi: event.note,
    startS: ((event.startBeat - firstBeat) * msPerBeat) / 1000,
    durationS: (event.durationBeats * msPerBeat) / 1000,
    hand: "right",
  }));
}

/**
 * Builds barred notation for an exercise. Notes at or above middle C go on
 * the treble staff, notes below on the bass staff — as a grand staff when
 * the exercise spans both registers (single-clef rendering used to strand
 * C5 on ledger lines above a bass staff). Notes are grouped into measures
 * (with rest-filling for under-filled bars) using the exercise's
 * beatsPerBar/beatUnit, defaulting to 4/4 for older content predating those
 * fields.
 */
function notationFor(exercise: MidiExerciseDef) {
  const beatsPerBar = exercise.beatsPerBar ?? 4;
  const beatUnit = exercise.beatUnit ?? 4;
  const timeSignature = `${beatsPerBar}/${beatUnit}`;

  const beatEventsFor = (events: typeof exercise.expected): BeatEvent[] => {
    const groups = new Map<number, typeof exercise.expected>();
    for (const event of events) groups.set(event.startBeat, [...(groups.get(event.startBeat) ?? []), event]);
    return [...groups.entries()]
      .sort(([a], [b]) => a - b)
      .map(([startBeat, group]) => ({
        ids: group.map((event) => event.id),
        keys: group.map((event) => midiToVexKey(event.note)),
        startBeat,
        durationBeats: Math.max(...group.map((event) => event.durationBeats)),
      }));
  };

  const treble = exercise.expected.filter((event) => event.note >= 60);
  const bass = exercise.expected.filter((event) => event.note < 60);
  if (treble.length > 0 && bass.length > 0) {
    return {
      grandStaff: true,
      treble: {
        clef: "treble",
        timeSignature,
        measures: groupIntoMeasures(beatEventsFor(treble), beatsPerBar).map((notes) => ({ notes })),
      },
      bass: {
        clef: "bass",
        timeSignature,
        measures: groupIntoMeasures(beatEventsFor(bass), beatsPerBar).map((notes) => ({ notes })),
      },
    };
  }
  const events = treble.length > 0 ? treble : bass;
  return {
    clef: treble.length > 0 ? "treble" : "bass",
    timeSignature,
    measures: groupIntoMeasures(beatEventsFor(events), beatsPerBar).map((notes) => ({ notes })),
  };
}

function SubmetricBar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-slate-600 dark:text-slate-300">{label}</span>
        <span className="font-medium tabular-nums">{value}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        <div
          className={`h-full rounded-full ${value >= PASS_SCORE ? "bg-brass-500" : "bg-felt-500"}`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

export default function MidiExercise({ exerciseId, title, instructions, lessonId = null, exercise, onCompleted }: Props) {
  const { subscribe, mockAdapter } = useMidiContext();
  const submitExercise = useProgressStore((s) => s.submitExercise);
  const submitPractice = useProgressStore((s) => s.submitPracticeGym);

  const [phase, setPhase] = useState<Phase>("idle");
  const [beat, setBeat] = useState<{ index: number; isCountIn: boolean } | null>(null);
  const [metronomeOn, setMetronomeOn] = useState(true);
  const [metronomeSettings, setMetronomeSettings] = useState<MetronomeSettings>(loadMetronomeSettings);
  const [result, setResult] = useState<ScoringResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [played, setPlayed] = useState(false);
  const [tempoPct, setTempoPct] = useState<25 | 50 | 75 | 100>(100);
  const [activeNoteIds, setActiveNoteIds] = useState<Set<string>>(new Set());
  const [liveScore, setLiveScore] = useState(0);
  const [liveCombo, setLiveCombo] = useState(0);
  const [lastDelta, setLastDelta] = useState<{ value: number; key: number } | null>(null);

  const raw = useRef<RawMidiEvent[]>([]);
  const start = useRef(0);
  const active = useRef(false);
  const previewTimeouts = useRef<number[]>([]);
  const previewSounding = useRef<Set<number>>(new Set());
  const metronomeOnRef = useRef(metronomeOn);
  metronomeOnRef.current = metronomeOn;
  const metronomeSettingsRef = useRef(metronomeSettings);
  metronomeSettingsRef.current = metronomeSettings;
  const liveNotesRef = useRef<LiveNote[]>([]);
  const liveJudgmentsRef = useRef<(PlayAlongJudgment | undefined)[]>([]);
  const liveMissCursorRef = useRef(0);
  const liveRafRef = useRef(0);
  const activeNoteIdsRef = useRef<string>("");
  const lastDeltaTimeoutRef = useRef<number | null>(null);

  const liveDueMidis = useMemo(
    () => liveNotesRef.current.filter((n) => activeNoteIds.has(n.id)).map((n) => n.midi),
    [activeNoteIds],
  );

  useEffect(
    () =>
      subscribe((event) => {
        if (!active.current) return;
        raw.current.push({ ...event, timestampMs: event.timestampMs - start.current });
        if (event.type !== "noteon") return;
        setPlayed(true);
        if (exercise?.scoring === "untimed") return;
        const songTimeS = (event.timestampMs - start.current) / 1000;
        const match = judgeNextPress(liveNotesRef.current, liveJudgmentsRef.current, event.note, songTimeS);
        if (match) {
          liveJudgmentsRef.current[match.index] = match.judgment;
          setLiveCombo((c) => (match.judgment === "perfect" || match.judgment === "good" ? c + 1 : 0));
          setLiveScore((s) => s + LIVE_POINTS[match.judgment]);
          flashLiveDelta(LIVE_POINTS[match.judgment]);
        } else {
          setLiveCombo(0);
          setLiveScore((s) => s - WRONG_PRESS_PENALTY);
          flashLiveDelta(-WRONG_PRESS_PENALTY);
        }
      }),
    [subscribe, exercise],
  );

  const stopPreview = () => {
    for (const id of previewTimeouts.current) window.clearTimeout(id);
    previewTimeouts.current = [];
    for (const note of previewSounding.current) mockAdapter.triggerNoteOff(note);
    previewSounding.current.clear();
  };

  // Cancel any sound/clicks/live-follow loop when the exercise unmounts.
  useEffect(
    () => () => {
      stopPreview();
      metronome.stop();
      cancelAnimationFrame(liveRafRef.current);
    },
    [],
  );

  const notation = useMemo(() => (exercise ? notationFor(exercise) : null), [exercise]);

  if (!exercise) {
    return <section className="card p-4 text-sm">Loading exercise…</section>;
  }

  const untimed = exercise.scoring === "untimed";
  const hasChords = exercise.expected.some((event) => event.chordGroupId !== null);
  const msPerBeat = 60_000 / exercise.tempoBpm;
  const effectiveBpm = exercise.tempoBpm * (tempoPct / 100);
  const notes = [...new Set(exercise.expected.map((n) => n.note))];
  // Pad the keyboard to octave boundaries so it reads as an instrument, not a fragment.
  const low = Math.max(36, Math.min(...notes) - 2);
  const high = Math.min(96, Math.max(...notes) + 2);
  const lowestNote = Math.max(36, low - (low % 12));
  const highestNote = Math.min(96, high + (11 - (high % 12)));

  /** Plays the expected performance through the piano so learners hear the target before attempting it. */
  const listen = () => {
    if (phase !== "idle" && phase !== "scored") return;
    stopPreview();
    setPhase("listening");
    const firstBeat = Math.min(...exercise.expected.map((n) => n.startBeat));
    let lastEnd = 0;
    for (const event of exercise.expected) {
      const onAt = (event.startBeat - firstBeat) * msPerBeat;
      const offAt = onAt + event.durationBeats * msPerBeat;
      lastEnd = Math.max(lastEnd, offAt);
      previewTimeouts.current.push(
        window.setTimeout(() => {
          previewSounding.current.add(event.note);
          mockAdapter.triggerNoteOn(event.note, 96);
        }, onAt),
      );
      previewTimeouts.current.push(
        window.setTimeout(() => {
          previewSounding.current.delete(event.note);
          mockAdapter.triggerNoteOff(event.note);
        }, offAt),
      );
    }
    previewTimeouts.current.push(window.setTimeout(() => setPhase((p) => (p === "listening" ? "idle" : p)), lastEnd + 150));
  };

  const flashLiveDelta = (value: number) => {
    setLastDelta({ value, key: Date.now() });
    if (lastDeltaTimeoutRef.current !== null) window.clearTimeout(lastDeltaTimeoutRef.current);
    lastDeltaTimeoutRef.current = window.setTimeout(() => setLastDelta(null), 700);
  };

  const stopLiveFollow = () => {
    cancelAnimationFrame(liveRafRef.current);
    activeNoteIdsRef.current = "";
    setActiveNoteIds(new Set());
  };

  const startLiveFollow = () => {
    liveNotesRef.current = liveNotesFor(exercise, effectiveBpm);
    liveJudgmentsRef.current = new Array<PlayAlongJudgment | undefined>(liveNotesRef.current.length).fill(undefined);
    liveMissCursorRef.current = 0;
    setLiveScore(0);
    setLiveCombo(0);
    setLastDelta(null);
    activeNoteIdsRef.current = "";
    setActiveNoteIds(new Set());

    const tick = () => {
      if (!active.current) return;
      const songTimeS = (performance.now() - start.current) / 1000;
      const notes = liveNotesRef.current;
      const judgments = liveJudgmentsRef.current;

      while (liveMissCursorRef.current < notes.length) {
        const note = notes[liveMissCursorRef.current];
        if (note.startS + JUDGE_WINDOWS_S.ok > songTimeS) break;
        if (judgments[liveMissCursorRef.current] === undefined) {
          judgments[liveMissCursorRef.current] = "miss";
          setLiveCombo(0);
          setLiveScore((s) => s + LIVE_POINTS.miss);
          flashLiveDelta(LIVE_POINTS.miss);
        }
        liveMissCursorRef.current += 1;
      }

      const due = notes
        .map((note, index) => ({ note, index }))
        .filter(
          ({ note, index }) =>
            judgments[index] === undefined && note.startS <= songTimeS && songTimeS < note.startS + note.durationS,
        )
        .map(({ note }) => note.id)
        .join(",");
      if (due !== activeNoteIdsRef.current) {
        activeNoteIdsRef.current = due;
        setActiveNoteIds(new Set(due ? due.split(",") : []));
      }

      liveRafRef.current = requestAnimationFrame(tick);
    };
    liveRafRef.current = requestAnimationFrame(tick);
  };

  const begin = () => {
    stopPreview();
    raw.current = [];
    setPlayed(false);
    setResult(null);
    setError(null);
    setBeat(null);
    if (untimed) {
      // No pulse to lock onto — start recording immediately, no count-in, no clicks.
      start.current = performance.now();
      active.current = true;
      setPhase("recording");
      return;
    }
    setPhase("counting-in");
    metronome.start({
      bpm: effectiveBpm,
      countInBeats: COUNT_IN_BEATS,
      sound: metronomeSettingsRef.current.sound,
      volume: metronomeSettingsRef.current.volume,
      onBeat: (index, isCountIn) => setBeat({ index, isCountIn }),
      onGo: () => {
        start.current = performance.now();
        active.current = true;
        setPhase("recording");
        if (!metronomeOnRef.current) metronome.stop();
        startLiveFollow();
      },
    });
  };

  const cancel = () => {
    metronome.stop();
    active.current = false;
    stopLiveFollow();
    setBeat(null);
    setPhase("idle");
  };

  const submit = async () => {
    metronome.stop();
    active.current = false;
    stopLiveFollow();
    setBeat(null);
    setPhase("submitting");
    try {
      const performedNotes = pairRawMidiEvents(raw.current);
      const scored = lessonId
        ? await submitExercise(exerciseId, { performedNotes, tempoPct })
        : await submitPractice(exercise, { performedNotes, tempoPct });
      setResult(scored);
      setPhase("scored");
      onCompleted?.(scored);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to score attempt");
      setPhase("idle");
    }
  };

  // Honest per-key feedback: red only for wrong/missed pitches; expected
  // notes you actually played show green even if timing or duration was off
  // (that feedback belongs in text, not on the key you pressed correctly).
  const feedback: Record<number, "correct" | "incorrect"> = {};
  if (result) {
    for (const note of notes) feedback[note] = "correct";
    for (const mistake of result.mistakes) {
      const pitchIssue = ["missed", "wrong", "missing-chord-tone"].includes(mistake.issue);
      const extraIssue = ["wrong", "extra", "extra-chord-tone"].includes(mistake.issue);
      if (pitchIssue && mistake.expectedNote !== null) feedback[mistake.expectedNote] = "incorrect";
      if (extraIssue && mistake.performedNote !== null) feedback[mistake.performedNote] = "incorrect";
    }
  }

  const passed = result !== null && result.score >= PASS_SCORE;
  const capturing = phase === "recording";

  return (
    <section className="card space-y-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">{instructions}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
          {!untimed && (
            <span className="rounded-full border border-slate-300 px-2 py-1 tabular-nums dark:border-slate-600">
              {exercise.beatsPerBar ?? 4}/{exercise.beatUnit ?? 4}
            </span>
          )}
          {untimed ? (
            <span className="rounded-full border border-slate-300 px-2 py-1 dark:border-slate-600">Untimed — find the right keys</span>
          ) : (
            <span className="rounded-full border border-slate-300 px-2 py-1 tabular-nums dark:border-slate-600">♩ = {exercise.tempoBpm}</span>
          )}
          {lessonId && <span className="rounded-full border border-slate-300 px-2 py-1 tabular-nums dark:border-slate-600">{PASS_SCORE} to pass</span>}
        </div>
      </div>

      {notation && <NotationRenderer data={notation} title="Read and play" activeNoteIds={capturing ? activeNoteIds : undefined} />}

      <div className="flex flex-wrap gap-2">
        {[...new Map(exercise.expected.map((e) => [e.startBeat, exercise.expected.filter((n) => n.startBeat === e.startBeat)])).values()].map(
          (group, i) => (
            <span key={i} className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700 dark:bg-slate-700 dark:text-slate-100">
              {group.map((n) => midiNoteToName(n.note)).join(" + ")}
            </span>
          ),
        )}
      </div>

      <VirtualPiano
        lowestNote={lowestNote}
        highestNote={highestNote}
        expectedNotes={capturing && !untimed ? liveDueMidis : phase !== "scored" ? notes : []}
        feedbackByNote={feedback}
      />

      <div className="flex flex-wrap items-center gap-3">
        {(phase === "idle" || phase === "scored" || phase === "listening") && (
          <>
            <button className="primary-button" onClick={begin}>
              {phase === "scored" ? "Try Again" : "Start Exercise"}
            </button>
            <button className="secondary-button" onClick={listen} disabled={phase === "listening"}>
              {phase === "listening" ? "Playing…" : "▶ Listen"}
            </button>
          </>
        )}
        {(phase === "counting-in" || capturing) && (
          <>
            {!untimed && (
              <div className="flex items-center gap-1.5" aria-hidden>
                {Array.from({ length: COUNT_IN_BEATS }, (_, i) => (
                  <span
                    key={i}
                    className={`h-2.5 w-2.5 rounded-full transition-colors ${
                      beat && beat.index >= i ? (beat.isCountIn ? "bg-felt-500" : "bg-brass-500") : "bg-slate-300 dark:bg-slate-600"
                    }`}
                  />
                ))}
              </div>
            )}
            <span className="text-sm text-slate-600 dark:text-slate-300" role="status">
              {phase === "counting-in" ? `Count-in… ${beat ? beat.index + 1 : ""}` : "Recording — play, then submit."}
            </span>
            {capturing && !untimed && (
              <div className="flex items-center gap-3 text-xs">
                <span className="tabular-nums">
                  <span className="text-slate-500">Live </span>
                  <strong className={liveScore >= 0 ? "text-brass-600 dark:text-brass-400" : "text-rose-600 dark:text-rose-400"}>
                    {liveScore}
                  </strong>
                </span>
                {liveCombo >= 3 && (
                  <span className="tabular-nums text-felt-600 dark:text-felt-400">combo ×{liveCombo}</span>
                )}
                {lastDelta && (
                  <span
                    key={lastDelta.key}
                    className={lastDelta.value >= 0 ? "text-brass-600 dark:text-brass-400" : "text-rose-600 dark:text-rose-400"}
                  >
                    {lastDelta.value >= 0 ? `+${lastDelta.value}` : lastDelta.value}
                  </span>
                )}
              </div>
            )}
            {capturing && (
              <button className="primary-button" disabled={!played} onClick={() => void submit()}>
                Submit Attempt
              </button>
            )}
            <button className="secondary-button" onClick={cancel}>Cancel</button>
          </>
        )}
        {phase === "submitting" && <span className="text-sm text-slate-500 dark:text-slate-400">Scoring…</span>}
        {!untimed && (
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1" role="radiogroup" aria-label="Practice tempo">
              <span className="mr-1 text-xs text-slate-500">Tempo</span>
              {([25, 50, 75, 100] as const).map((pct) => (
                <button
                  key={pct}
                  type="button"
                  role="radio"
                  aria-checked={tempoPct === pct}
                  disabled={capturing || phase === "counting-in"}
                  onClick={() => setTempoPct(pct)}
                  className={`rounded-md px-2 py-1 text-xs transition-colors ${
                    tempoPct === pct
                      ? "bg-felt-600 font-medium text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                  } disabled:opacity-50`}
                >
                  {pct}%
                </button>
              ))}
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <input type="checkbox" checked={metronomeOn} onChange={(e) => setMetronomeOn(e.target.checked)} />
              Metronome while playing
            </label>
            <MetronomeControls
              settings={metronomeSettings}
              onChange={(next) => {
                setMetronomeSettings(next);
                saveMetronomeSettings(next);
              }}
            />
          </div>
        )}
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      {result && (
        <div
          role="status"
          aria-live="polite"
          className={`rounded-lg border p-4 ${
            passed
              ? "border-brass-400/60 bg-brass-100/60 dark:border-brass-600/50 dark:bg-brass-700/10"
              : "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800"
          }`}
        >
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p className="font-display text-3xl font-semibold tabular-nums">{result.score}</p>
            <p className={`text-sm font-medium ${passed ? "text-brass-700 dark:text-brass-300" : "text-slate-600 dark:text-slate-300"}`}>
              {passed ? (lessonId ? "Passed — nice playing." : "Clean run — nice playing.") : `${PASS_SCORE} to pass — keep at it.`}
            </p>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
            <SubmetricBar label="Notes" value={result.noteAccuracy} />
            {!untimed && <SubmetricBar label="Timing" value={result.timingAccuracy} />}
            {!untimed && <SubmetricBar label="Rhythm" value={result.rhythmAccuracy} />}
            {(!untimed || hasChords) && <SubmetricBar label="Chords" value={result.chordAccuracy} />}
          </div>
          {result.feedback.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm text-slate-700 dark:text-slate-200">
              {result.feedback.map((line, i) => (
                <li key={i}>• {line}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
