import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { MidiExercise as MidiExerciseDef, ScoringResult } from "@keyboard-sensei/shared-types";
import { midiNoteToName } from "@keyboard-sensei/music-theory";
import MetronomeControls, { loadMetronomeSettings, saveMetronomeSettings, type MetronomeSettings } from "./MetronomeControls";
import VirtualPiano from "../piano/VirtualPiano";
import { Advanced, Button, Card, Chip, Slider, Toggle, Toolbar } from "../ui";
import { useExperienceMode } from "../ui/useExperienceMode";
import { coveredNoteIds, groupByStart } from "./exerciseCoverage";
import type { FocusMode } from "./useFocusModeShim";
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
  /** Primary action shown inside the result card once the exercise is passed (e.g. "Next step"). */
  nextAction?: { label: string; onClick: () => void };
  /** When given, the exercise offers focus mode and reduces itself to the essentials while it is active. */
  focus?: FocusMode;
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

export default function MidiExercise({ exerciseId, title, instructions, lessonId = null, exercise, onCompleted, onRecordingClock, notationKey, nextAction, focus }: Props) {
  const experience = useExperienceMode();
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
  // Focus mode lifts the exercise out of the page flow; this keeps its place so the page does not jump.
  const [heldHeight, setHeldHeight] = useState<number | undefined>(undefined);

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
    pressedNotes,
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
  const covered = useMemo(() => coveredNoteIds(exercise?.expected ?? [], pressedNotes), [exercise, pressedNotes]);

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
  const restart = () => {
    cancel();
    begin();
  };

  const passed = result !== null && result.score >= PASS_SCORE;
  const capturing = phase === "recording";
  const inFocus = focus?.active ?? false;
  const advanced = experience === "advanced";
  const running = phase === "counting-in" || capturing || phase === "paused";

  const noteGroups = groupByStart(exercise.expected);
  const nextGroup = running ? noteGroups.find((group) => group.notes.some((n) => !covered.has(n.id))) : undefined;

  const speedWord = chosenBpm < 70 ? "slow" : chosenBpm < 110 ? "medium" : "fast";

  // The toolbar's buttons per phase. `main` is the one filled action; focus mode keeps only it.
  let main: ReactNode = null;
  const others: ReactNode[] = [];
  if (phase === "idle" || phase === "scored" || phase === "listening") {
    others.push(
      <Button key="listen" variant="gray" onClick={listen} disabled={phase === "listening"} icon={<span aria-hidden>▶</span>}>
        {phase === "listening" ? "Playing…" : "Listen"}
      </Button>,
    );
    main = (
      <Button key="start" variant="filled" onClick={begin}>
        {phase === "scored" ? "Try again" : "Start"}
      </Button>
    );
  } else if (phase === "counting-in") {
    main = (
      <Button key="cancel" variant="filled" onClick={cancel}>
        Cancel
      </Button>
    );
  } else if (capturing) {
    main = (
      <Button key="finish" variant="filled" disabled={!played} onClick={() => void submit()}>
        Finish
      </Button>
    );
    if (untimed) {
      others.push(
        <Button key="restart" variant="gray" onClick={restart}>
          Restart
        </Button>,
      );
    } else {
      others.push(
        <Button key="pause" variant="gray" onClick={pause}>
          Pause
        </Button>,
        <Button key="cancel" variant="gray" onClick={cancel}>
          Cancel
        </Button>,
      );
    }
  } else if (phase === "paused") {
    main = (
      <Button key="resume" variant="filled" onClick={resume}>
        Resume
      </Button>
    );
    others.push(
      <Button key="cancel" variant="gray" onClick={cancel}>
        Cancel
      </Button>,
    );
  }
  const toolbarButtons = inFocus
    ? [
        main,
        <Button key="exit" variant="gray" onClick={focus?.exit} aria-label="Exit focus mode">
          Exit
        </Button>,
      ]
    : [...others.slice(0, 1), main, ...others.slice(1)];

  const statusText =
    phase === "counting-in"
      ? `Count-in… ${beat ? beat.index + 1 : ""}`
      : phase === "paused"
        ? "Paused. Adjust speed or settings, then resume."
        : capturing
          ? untimed
            ? "Play the notes. This finishes by itself when you have found them all."
            : "Playing. Tap Finish when you are done."
          : phase === "submitting"
            ? "Scoring…"
            : null;

  const sheetSizeControl = (
    <div className="flex items-center gap-1 text-xs text-slate-500">
      <span className="mr-1">Sheet size</span>
      <button
        type="button"
        aria-label="Smaller sheet"
        onClick={() => setSheetScale((v) => Math.max(0.5, Math.round((v - 0.1) * 10) / 10))}
        disabled={sheetScale <= 0.5}
        className="h-8 w-8 rounded border border-slate-300 leading-none disabled:opacity-40 dark:border-slate-600"
      >
        −
      </button>
      <span className="w-10 text-center tabular-nums">{Math.round(sheetScale * 100)}%</span>
      <button
        type="button"
        aria-label="Larger sheet"
        onClick={() => setSheetScale((v) => Math.min(1.6, Math.round((v + 0.1) * 10) / 10))}
        disabled={sheetScale >= 1.6}
        className="h-8 w-8 rounded border border-slate-300 leading-none disabled:opacity-40 dark:border-slate-600"
      >
        +
      </button>
    </div>
  );

  const tempoLocked = capturing || phase === "counting-in";

  const enterFocus = () => {
    setHeldHeight(sectionRef.current?.offsetHeight);
    focus?.enter();
  };

  return (
    <div style={inFocus ? { minHeight: heldHeight } : undefined}>
      <section
        ref={sectionRef}
        data-focus={inFocus ? "true" : undefined}
        className={
          inFocus
            ? "fixed inset-0 z-50 flex flex-col justify-end gap-2 overflow-y-auto bg-[var(--bg)] p-2"
            : "scroll-mt-3 space-y-4"
        }
      >
        {!inFocus && (
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-display text-2xl font-semibold leading-tight">{title}</h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{instructions}</p>
            </div>
            {focus && (
              <Button variant="gray" size="sm" className="shrink-0" aria-label="Focus mode" onClick={enterFocus}>
                <span aria-hidden>⤢</span>
              </Button>
            )}
          </div>
        )}

        {!inFocus && (
          <div className="flex flex-wrap items-center gap-2">
            {untimed && <Chip>Take your time</Chip>}
            {!untimed && advanced && (
              <>
                <Chip>
                  {exercise.beatsPerBar ?? 4}/{exercise.beatUnit ?? 4}
                </Chip>
                <Chip>♩ = {exercise.tempoBpm}</Chip>
              </>
            )}
            {lessonId && <Chip>Score {PASS_SCORE} to pass</Chip>}
          </div>
        )}

        {notation && (
          <div className="shrink-0 overflow-x-auto" role="img" aria-label={`Sheet music: ${title}`}>
            <div style={{ transform: `scale(${sheetScale})`, transformOrigin: "top left", width: `${100 / sheetScale}%` }}>
              <NotationRenderer
                data={notation}
                title="Read and play"
                activeNoteIds={capturing && highlightEnabled ? activeNoteIds : undefined}
                verticalRange={exerciseRange}
              />
            </div>
          </div>
        )}

        <ul className="flex flex-wrap gap-2" aria-label="Notes to play">
          {noteGroups.map((group) => {
            const done = group.notes.every((n) => covered.has(n.id));
            const isNext = group === nextGroup;
            return (
              <li key={group.startBeat}>
                <Chip tone={done ? "success" : isNext ? "tint" : "neutral"} icon={done ? "✓" : undefined}>
                  {group.notes.map((n) => midiNoteToName(n.note)).join(" + ")}
                  {done && <span className="sr-only"> (found)</span>}
                  {isNext && <span className="sr-only"> (next)</span>}
                </Chip>
              </li>
            );
          })}
        </ul>

        {!inFocus && phase === "idle" && !result && (
          <p className="rounded-full bg-[var(--cell)] px-4 py-3 text-sm shadow-sm">
            <span aria-hidden>👂 </span>Not sure? Tap <strong>Listen</strong> to hear it first.
          </p>
        )}

        {statusText && (
          <p role="status" className="text-sm text-slate-600 dark:text-slate-300">
            {statusText}
          </p>
        )}

        {capturing && !untimed && highlightEnabled && advanced && (
          <div className="flex items-center gap-3 text-xs">
            <span className="tabular-nums">
              <span className="text-slate-500">Live </span>
              <strong className={liveScore >= 0 ? "text-brass-600 dark:text-brass-400" : "text-rose-600 dark:text-rose-400"}>{liveScore}</strong>
            </span>
            {liveCombo >= 3 && <span className="tabular-nums text-felt-600 dark:text-felt-400">{liveCombo} notes in a row</span>}
            {lastDelta && (
              <span key={lastDelta.key} className={lastDelta.value >= 0 ? "text-brass-600 dark:text-brass-400" : "text-rose-600 dark:text-rose-400"}>
                {lastDelta.value >= 0 ? `+${lastDelta.value}` : lastDelta.value}
              </span>
            )}
          </div>
        )}

        {error && <p className="text-sm text-rose-600">{error}</p>}

        {result && (
          <Card
            role="status"
            aria-live="polite"
            className={passed ? "border border-brass-400/60 bg-brass-100/60 dark:border-brass-600/50 dark:bg-brass-700/10" : undefined}
          >
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <p className="font-display text-3xl font-semibold tabular-nums">{result.score}</p>
              <p className={`text-sm font-medium ${passed ? "text-brass-700 dark:text-brass-300" : "text-slate-600 dark:text-slate-300"}`}>
                {passed ? (lessonId ? "Passed. Nice playing." : "Clean run. Nice playing.") : `Score ${PASS_SCORE} to pass. Keep at it.`}
              </p>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
              <SubmetricBar label="Notes hit" value={result.noteAccuracy} />
              {!untimed && <SubmetricBar label="Timing" value={result.timingAccuracy} />}
              {!untimed && <SubmetricBar label="Rhythm" value={result.rhythmAccuracy} />}
              {(!untimed || hasChords) && <SubmetricBar label="Chords" value={result.chordAccuracy} />}
              {result.dynamics && <SubmetricBar label="Dynamics" value={result.dynamics.score} />}
            </div>
            {result.dynamics && advanced && (
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
            {passed && nextAction && (
              <Button className="mt-4 w-full" variant="filled" size="lg" onClick={nextAction.onClick}>
                {nextAction.label}
              </Button>
            )}
          </Card>
        )}

        <div className="flex justify-center">
          <Toolbar aria-label="Exercise controls" placement="floating">
            {toolbarButtons}
          </Toolbar>
        </div>

        <VirtualPiano
          lowestNote={lowestNote}
          highestNote={highestNote}
          recommendedRange={exerciseRange}
          expectedNotes={capturing && !untimed && highlightEnabled ? liveDueMidis : phase !== "scored" ? notes : emptyNotes}
          soundingNotes={listenNotes}
          feedbackByNote={feedback}
          showControls={advanced}
          showHint={!inFocus}
          maxWhiteKeyHeightPx={220}
        />

        {/* Speed, metronome and highlighting sit behind a disclosure: they are adjustments,
            not the task, and on a first visit they crowded the prompt and pushed the
            keyboard below the fold. Simple mode keeps only speed and the click. */}
        {!inFocus && (!untimed || advanced) && (
          <details className="group rounded-lg border border-slate-200 text-xs dark:border-slate-700">
            <summary className="min-h-11 cursor-pointer select-none px-3 py-3 text-slate-700 dark:text-slate-200">
              {advanced ? "Practice settings" : "More options"}
              {!untimed && (
                <span className="ml-2 text-slate-500">
                  {advanced
                    ? `${Math.round(chosenBpm)} BPM · metronome ${metronomeOn ? "on" : "off"} · highlighting ${highlightEnabled ? "on" : "off"}`
                    : `Speed: ${Math.round(chosenBpm)} (${speedWord})`}
                </span>
              )}
            </summary>
            <div className="space-y-3 border-t border-slate-200 px-3 py-3 dark:border-slate-700">
              {!untimed && (
                <div className="space-y-1">
                  <p className="text-slate-700 dark:text-slate-200">
                    {advanced ? (
                      <>
                        Tempo <span className="text-slate-500">(written: {exercise.tempoBpm} BPM)</span>
                      </>
                    ) : (
                      "Speed"
                    )}
                  </p>
                  <Slider
                    min={sliderMinBpm}
                    max={sliderMaxBpm}
                    step={1}
                    value={chosenBpm}
                    disabled={tempoLocked}
                    onChange={(value) => setTempoBpm(value)}
                    aria-label={advanced ? "Practice tempo in beats per minute" : "Speed"}
                    formatValue={(value) =>
                      advanced ? `${Math.round(value)} BPM (${Math.round((value / writtenBpm) * 100)}% of written tempo)` : `Speed: ${Math.round(value)} (${speedWord})`
                    }
                  />
                </div>
              )}
              {!untimed && <Toggle label="Metronome while playing" checked={metronomeOn} onChange={setMetronomeOn} />}
              {advanced && !untimed && (
                <Toggle
                  label="Highlight notes while playing"
                  checked={highlightEnabled}
                  onChange={(checked) => {
                    setHighlightEnabled(checked);
                    saveHighlightEnabled(checked);
                  }}
                />
              )}
              <Advanced>
                {notation && sheetSizeControl}
                {!untimed && (
                  <MetronomeControls
                    settings={metronomeSettings}
                    onChange={(next) => {
                      setMetronomeSettings(next);
                      saveMetronomeSettings(next);
                    }}
                  />
                )}
              </Advanced>
            </div>
          </details>
        )}
      </section>
    </div>
  );
}
