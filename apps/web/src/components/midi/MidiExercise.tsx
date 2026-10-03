import { useEffect, useMemo, useRef, useState } from "react";
import type { MidiExercise as MidiExerciseDef, ScoringResult } from "@keyboard-sensei/shared-types";
import { midiNoteToName } from "@keyboard-sensei/music-theory";
import MetronomeControls, { loadMetronomeSettings, saveMetronomeSettings, type MetronomeSettings } from "./MetronomeControls";
import VirtualPiano from "../piano/VirtualPiano";
import NotationRenderer from "../notation/NotationRenderer";
import { COUNT_IN_BEATS, useExerciseAttempt, type RecordingClock } from "./useExerciseAttempt";
import { engrave, type EngraveInputNote, type StaffName } from "../../utils/engraving";
import { estimateKey, type KeyInfo } from "../../utils/keySignature";
import { loadHighlightEnabled, saveHighlightEnabled } from "../../utils/notationHighlight";

/** Score a lesson exercise must reach for the lesson to count as passed (mirrors the API's threshold). */
export const PASS_SCORE = 70;

const SHEET_SCALE_KEY = "ks-exercise-sheet-scale";
/** UI slider bounds (BPM). Narrower than the API's accepted tempoPct range — see tempoBpmBounds. */
const SLIDER_MIN_BPM = 25;
const SLIDER_MAX_BPM = 200;
/** API-enforced tempoPct range (apps/api/src/app.ts: z.number().min(10).max(250)). */
const MIN_TEMPO_PCT = 10;
const MAX_TEMPO_PCT = 250;

/**
 * Derives the actual slider [min, max] BPM for a given exercise, tightened so
 * that neither end can ever produce a tempoPct outside the API's accepted
 * [MIN_TEMPO_PCT, MAX_TEMPO_PCT] range. Without this, e.g. a 60 BPM exercise
 * would let a user drag to 200 BPM (333%), which the API rejects with a 400.
 */
function tempoBpmBounds(writtenBpm: number): { min: number; max: number } {
  const min = Math.max(SLIDER_MIN_BPM, Math.ceil((writtenBpm * MIN_TEMPO_PCT) / 100));
  const max = Math.min(SLIDER_MAX_BPM, Math.floor((writtenBpm * MAX_TEMPO_PCT) / 100));
  return { min: Math.min(min, max), max };
}
interface Props {
  exerciseId: string;
  title: string;
  instructions: string;
  lessonId?: string | null;
  exercise?: MidiExerciseDef;
  onCompleted?: (result: ScoringResult) => void;
  /**
   * Fired when a recording attempt starts/stops, so a caller (e.g. song-excerpt
   * accompaniment playback) can drive its own clock off the SAME start time and
   * practice tempo this exercise is using, without this component knowing
   * anything about accompaniment. Called with the clock the instant capture
   * actually begins (after any count-in), and with `null` when the attempt is
   * cancelled, submitted, or the component unmounts.
   */
  onRecordingClock?: (clock: RecordingClock | null) => void;
  /** Key of the song an excerpt comes from — drawn as a key signature (see notationFor). */
  notationKey?: KeyInfo;
}

// Re-exported: the pause-invisible-to-scoring clock is tested from here.
export { elapsedPerformanceMs } from "./useExerciseAttempt";

/**
 * Builds barred notation for an exercise. Notes at or above middle C go on
 * the treble staff, notes below on the bass staff — as a grand staff when
 * the exercise spans both registers (single-clef rendering used to strand
 * C5 on ledger lines above a bass staff). `engrave` does the rest: bars from
 * the exercise's beatsPerBar/beatUnit (4/4 for older content predating those
 * fields), chords, ties, the fewest correct rests, and pitch spelling.
 *
 * `key` is the key of the song an excerpt comes from: it is drawn as a key
 * signature. Authored lessons pass none — their sharps and flats are often the
 * point of the lesson, so every accidental stays written out, but notes are
 * still SPELLED for the key the notes imply (B♭, not A♯, in an F-major tune).
 */
export function notationFor(exercise: MidiExerciseDef, key?: KeyInfo) {
  const numerator = exercise.beatsPerBar ?? 4;
  const denominator = exercise.beatUnit ?? 4;
  // Exercise beats are NOTATED beats (eighths in 6/8); engrave works in quarter notes.
  const quartersPerBeat = 4 / denominator;
  const input: EngraveInputNote[] = exercise.expected.map((event) => ({
    id: event.id,
    midi: event.note,
    staff: event.note >= 60 ? "treble" : "bass",
    startBeat: event.startBeat * quartersPerBeat,
    endBeat: (event.startBeat + event.durationBeats) * quartersPerBeat,
  }));
  const hasTreble = input.some((n) => n.staff === "treble");
  const hasBass = input.some((n) => n.staff === "bass");
  const staves: StaffName[] = hasTreble && hasBass ? ["treble", "bass"] : [hasBass ? "bass" : "treble"];
  const spellingKey = key ?? estimateKey(exercise.expected.map((event) => ({ midi: event.note, weight: event.durationBeats })));
  const { staves: engraved } = engrave(input, staves, {
    meters: [{ startBeat: 0, numerator, denominator }],
    keys: [{ startBeat: 0, key: spellingKey }],
    showKeySignature: key !== undefined,
  });
  if (staves.length === 2) return { grandStaff: true, treble: engraved.treble, bass: engraved.bass };
  return { ...engraved[staves[0]] };
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

export default function MidiExercise({ exerciseId, title, instructions, lessonId = null, exercise, onCompleted, onRecordingClock, notationKey }: Props) {
  // The span this exercise actually uses — drives VirtualPiano's "Fit to piece"
  // button, so the user can widen a too-narrow keyboard in one click.
  const exerciseRange = useMemo(() => {
    const midis = exercise?.expected?.map((n) => n.note) ?? [];
    if (midis.length === 0) return undefined;
    return { lowestNote: Math.min(...midis), highestNote: Math.max(...midis) };
  }, [exercise]);

  // Sheet size. The notation had no size control at all here (only Play-Along's
  // strip had one), so a sheet that was too tall could not be shrunk.
  const [sheetScale, setSheetScale] = useState<number>(() => {
    const raw = Number(localStorage.getItem(SHEET_SCALE_KEY));
    return Number.isFinite(raw) && raw >= 0.5 && raw <= 1.6 ? raw : 1;
  });
  useEffect(() => {
    localStorage.setItem(SHEET_SCALE_KEY, String(sheetScale));
  }, [sheetScale]);

  const [metronomeOn, setMetronomeOn] = useState(true);
  const [metronomeSettings, setMetronomeSettings] = useState<MetronomeSettings>(loadMetronomeSettings);
  const [highlightEnabled, setHighlightEnabled] = useState<boolean>(loadHighlightEnabled);
  const [tempoBpm, setTempoBpm] = useState<number | null>(null);
  const sectionRef = useRef<HTMLElement | null>(null);

  const writtenBpm = exercise?.tempoBpm ?? 100;
  const { min: sliderMinBpm, max: sliderMaxBpm } = tempoBpmBounds(writtenBpm);
  // Slider's chosen BPM IS the practice tempo; default to written tempo (100%) until the user moves it.
  const chosenBpm = Math.min(sliderMaxBpm, Math.max(sliderMinBpm, tempoBpm ?? writtenBpm));
  const effectiveBpm = chosenBpm;
  const tempoPct = (chosenBpm / writtenBpm) * 100;

  const {
    phase,
    beat,
    result,
    error,
    played,
    activeNoteIds,
    liveDueMidis,
    liveScore,
    liveCombo,
    lastDelta,
    listenNotes,
    listen,
    begin: beginAttempt,
    pause,
    resume,
    cancel,
    submit,
  } = useExerciseAttempt({
    exercise,
    exerciseId,
    lessonId,
    effectiveBpm,
    tempoPct,
    metronomeOn,
    metronomeSettings,
    onCompleted,
    onRecordingClock,
  });

  const notation = useMemo(() => (exercise ? notationFor(exercise, notationKey) : null), [exercise, notationKey]);
  // Stable across renders, so the memoised piano doesn't redraw on every live-score tick.
  const notes = useMemo(() => [...new Set(exercise?.expected.map((n) => n.note) ?? [])], [exercise]);

  // Honest per-key feedback: red only for wrong/missed pitches; expected
  // notes you actually played show green even if timing or duration was off
  // (that feedback belongs in text, not on the key you pressed correctly).
  const feedback = useMemo(() => {
    const byNote: Record<number, "correct" | "incorrect"> = {};
    if (!result) return byNote;
    for (const note of notes) byNote[note] = "correct";
    for (const mistake of result.mistakes) {
      const pitchIssue = ["missed", "wrong", "missing-chord-tone"].includes(mistake.issue);
      const extraIssue = ["wrong", "extra", "extra-chord-tone"].includes(mistake.issue);
      if (pitchIssue && mistake.expectedNote !== null) byNote[mistake.expectedNote] = "incorrect";
      if (extraIssue && mistake.performedNote !== null) byNote[mistake.performedNote] = "incorrect";
    }
    return byNote;
  }, [result, notes]);
  const emptyNotes = useMemo<number[]>(() => [], []);

  if (!exercise) {
    return <section className="card p-4 text-sm">Loading exercise…</section>;
  }

  const untimed = exercise.scoring === "untimed";
  const hasChords = exercise.expected.some((event) => event.chordGroupId !== null);
  // Pad the keyboard to octave boundaries so it reads as an instrument, not a fragment.
  const low = Math.max(36, Math.min(...notes) - 2);
  const high = Math.min(96, Math.max(...notes) + 2);
  const lowestNote = Math.max(36, low - (low % 12));
  const highestNote = Math.min(96, high + (11 - (high % 12)));

  const begin = () => {
    // Bring the whole exercise (notation, keys, controls) on screen before the count-in.
    // "auto", not "smooth": the count-in starts immediately and must not race a scroll.
    sectionRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
    beginAttempt();
  };

  const passed = result !== null && result.score >= PASS_SCORE;
  const capturing = phase === "recording";

  return (
    <section ref={sectionRef} className="card scroll-mt-3 space-y-3 p-4">
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

      {notation && (
        <div>
          <div className="mb-1 flex items-center justify-end gap-1 text-xs text-slate-500">
            <span className="mr-1">Sheet size</span>
            <button
              type="button"
              aria-label="Smaller sheet"
              onClick={() => setSheetScale((v) => Math.max(0.5, Math.round((v - 0.1) * 10) / 10))}
              disabled={sheetScale <= 0.5}
              className="h-6 w-6 rounded border border-slate-300 leading-none disabled:opacity-40 dark:border-slate-600"
            >
              −
            </button>
            <span className="w-10 text-center tabular-nums">{Math.round(sheetScale * 100)}%</span>
            <button
              type="button"
              aria-label="Larger sheet"
              onClick={() => setSheetScale((v) => Math.min(1.6, Math.round((v + 0.1) * 10) / 10))}
              disabled={sheetScale >= 1.6}
              className="h-6 w-6 rounded border border-slate-300 leading-none disabled:opacity-40 dark:border-slate-600"
            >
              +
            </button>
          </div>
          <div className="overflow-x-auto" role="img" aria-label={`Sheet music: ${title}`}>
            <div style={{ transform: `scale(${sheetScale})`, transformOrigin: "top left", width: `${100 / sheetScale}%` }}>
              <NotationRenderer
                data={notation}
                title="Read and play"
                activeNoteIds={capturing && highlightEnabled ? activeNoteIds : undefined}
                verticalRange={exerciseRange}
              />
            </div>
          </div>
        </div>
      )}

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
        recommendedRange={exerciseRange}
        expectedNotes={capturing && !untimed && highlightEnabled ? liveDueMidis : phase !== "scored" ? notes : emptyNotes}
        soundingNotes={listenNotes}
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
        {(phase === "counting-in" || capturing || phase === "paused") && (
          <>
            {!untimed && phase !== "paused" && (
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
              {phase === "counting-in"
                ? `Count-in… ${beat ? beat.index + 1 : ""}`
                : phase === "paused"
                  ? "Paused — adjust tempo or settings, then resume."
                  : "Recording — play, then submit."}
            </span>
            {capturing && !untimed && highlightEnabled && (
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
            {capturing && (
              <button className="secondary-button" onClick={pause}>
                Pause
              </button>
            )}
            {phase === "paused" && (
              <button className="primary-button" onClick={resume}>
                Resume
              </button>
            )}
            <button className="secondary-button" onClick={cancel}>Cancel</button>
          </>
        )}
        {phase === "submitting" && <span className="text-sm text-slate-500 dark:text-slate-400">Scoring…</span>}
      </div>

      {/* Tempo, metronome and highlighting sit behind a disclosure: they're adjustments,
          not the task, and on a first visit (the skill assessment) they crowded the
          prompt and pushed the keyboard below the fold. */}
      {!untimed && (
        <details className="group rounded-lg border border-slate-200 text-xs dark:border-slate-700">
          <summary className="cursor-pointer select-none px-3 py-2 text-slate-700 dark:text-slate-200">
            Practice settings
            <span className="ml-2 text-slate-500">
              {Math.round(chosenBpm)} BPM · metronome {metronomeOn ? "on" : "off"} · highlighting {highlightEnabled ? "on" : "off"}
            </span>
          </summary>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-slate-200 px-3 py-3 dark:border-slate-700">
            <label className="flex flex-wrap items-center gap-2">
              <span className="text-slate-700 dark:text-slate-200">
                Tempo <span className="text-slate-500">(written: {exercise.tempoBpm} BPM)</span>
              </span>
              <input
                type="range"
                min={sliderMinBpm}
                max={sliderMaxBpm}
                step={1}
                value={chosenBpm}
                disabled={capturing || phase === "counting-in"}
                onChange={(e) => setTempoBpm(Number(e.target.value))}
                aria-label="Practice tempo in beats per minute"
                className="h-1.5 w-32 cursor-pointer disabled:opacity-50 sm:w-40"
              />
              <span className="whitespace-nowrap tabular-nums text-slate-700 dark:text-slate-200">
                <strong className="font-medium">{Math.round(chosenBpm)} BPM</strong>{" "}
                <span className="text-slate-500">({Math.round(tempoPct)}% of written tempo)</span>
              </span>
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-slate-700 dark:text-slate-200">
              <input type="checkbox" checked={metronomeOn} onChange={(e) => setMetronomeOn(e.target.checked)} />
              Metronome while playing
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-slate-700 dark:text-slate-200">
              <input
                type="checkbox"
                checked={highlightEnabled}
                onChange={(e) => {
                  setHighlightEnabled(e.target.checked);
                  saveHighlightEnabled(e.target.checked);
                }}
              />
              Highlight notes while playing
            </label>
            <MetronomeControls
              settings={metronomeSettings}
              onChange={(next) => {
                setMetronomeSettings(next);
                saveMetronomeSettings(next);
              }}
            />
          </div>
        </details>
      )}

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
            {result.dynamics && <SubmetricBar label="Dynamics" value={result.dynamics.score} />}
          </div>
          {result.dynamics && (
            <p className="mt-2 text-xs tabular-nums text-slate-500" aria-label="Dynamics">
              {result.dynamics.evenness !== null && `Volume spread ±${result.dynamics.velocitySpread} (evenness ${result.dynamics.evenness}%)`}
              {result.dynamics.evenness !== null && result.dynamics.chordBalance !== null && " · "}
              {result.dynamics.chordBalance !== null &&
                `Chord tones within ${result.dynamics.chordVelocityRange} of each other (balance ${result.dynamics.chordBalance}%)`}
            </p>
          )}
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
