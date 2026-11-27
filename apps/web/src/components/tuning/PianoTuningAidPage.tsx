import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { midiNoteToName } from "@keyboard-sensei/music-theory";
import {
  createSession,
  currentTarget,
  curveForSession,
  detectBeats,
  isPitchSubstep,
  measureLivePitch,
  measurePianoNote,
  MIN_SAMPLE_CONFIDENCE,
  parseSession,
  partialHz,
  planSummary,
  serializeSession,
  summarizeSession,
  tuningReducer,
  unisonVerdict,
  type CheckVerdict,
  type CurrentTarget,
  type FlowAction,
  type PianoNoteAnalyzer,
  type StopReason,
  type Substep,
  type TuningSession,
} from "@keyboard-sensei/piano-tuning";
import { Button, Card } from "../ui";
import FineDisplay from "./FineDisplay";
import SafetyNote, { TechnicianRecommendation } from "./SafetyNote";
import { createMicSampleSource, type SampleSource } from "./sampleSource";

/** Saved progress of a tuning session (never the safety acknowledgement). New key, `mp-` prefix (spec 1.2). */
export const TUNING_SESSION_KEY = "mp-piano-tuning-session";
/** Tuner settings from spec 5.3; only the reference pitch is read here. */
export const TUNER_SETTINGS_KEY = "mp-tuner-settings";

const MEASURE_MS = 1500;
const CHECK_MS = 3000;
const LIVE_BLOCK_S = 0.6;

function noteName(midi: number): string {
  return midiNoteToName(midi).split("/")[0];
}

function readReferenceA4(): number {
  try {
    const raw = localStorage.getItem(TUNER_SETTINGS_KEY);
    const a4 = raw ? Number((JSON.parse(raw) as { a4Hz?: unknown }).a4Hz) : NaN;
    return Number.isFinite(a4) && a4 >= 415 && a4 <= 466 ? a4 : 440;
  } catch {
    return 440;
  }
}

function loadSession(): TuningSession {
  try {
    const saved = parseSession(localStorage.getItem(TUNING_SESSION_KEY));
    if (saved && saved.phase !== "done") return saved;
  } catch {
    // storage unavailable: start fresh
  }
  return createSession({ a4Hz: readReferenceA4() });
}

const STOP_REASON_TEXT: Record<StopReason, string> = {
  "will-not-hold": "the note will not hold its pitch",
  "pin-too-loose": "the tuning pin turns too easily",
  "pitch-jumps": "the pitch jumps unpredictably",
  other: "something did not feel right",
};

const VERDICT_TEXT: Record<CheckVerdict, string> = {
  clean: "Clean: no beats.",
  "slow-beat": "Nearly there: a very slow beat.",
  beating: "Beating: keep adjusting in very small movements.",
};

function instructions(step: Substep, t: CurrentTarget): string {
  const name = noteName(t.midi);
  const partner = t.partnerMidi !== undefined ? noteName(t.partnerMidi) : "";
  switch (step) {
    case "rough":
      return `Pitch raise, rough pass: bring every string of ${name} up to the rough target shown. Stop at the target; never go above it.`;
    case "mute":
      return t.strings === 3
        ? `${name} has three strings. Mute the left and right strings (a felt strip or rubber mutes) so only the centre string sounds.`
        : `${name} has two strings. Mute one of them so only one string sounds.`;
    case "centre":
      return `Play ${name} and turn the pin of the centre string until the display stands still. Come up to the target from slightly below and finish with a tiny movement to set the pin.`;
    case "first":
      return `Play ${name} and tune the open string until the display stands still. Come up to the target from slightly below.`;
    case "single":
      return `${name} has one string. Tune it until the display stands still. Come up to the target from slightly below.`;
    case "unison-left":
      return `Remove the mute from the left string. Play ${name} and turn the left string's pin until the beats slow down and disappear. Do not move the centre string.`;
    case "unison-right":
      return `Remove the last mute. Play ${name} and bring the right string in until all three sound as one, with no beats.`;
    case "unison":
      return `Remove the mute. Play ${name} and bring the second string in until the beats disappear. Do not move the first string.`;
    case "octave":
      return `Play ${partner} and ${name} together and let them ring. A good octave has no beats.`;
  }
}

export interface PianoTuningAidPageProps {
  /** Audio source; defaults to the microphone. */
  source?: SampleSource;
  /** Note analyser; the Piano check's analyser plugs in here. */
  analyzer?: PianoNoteAnalyzer;
  readingIntervalMs?: number;
}

/** Guided piano tuning (spec 6.2). "Start over" remounts the flow with a fresh session. */
export default function PianoTuningAidPage(props: PianoTuningAidPageProps) {
  const [generation, setGeneration] = useState(0);
  return <TuningAid key={generation} {...props} onRestart={() => setGeneration((g) => g + 1)} />;
}

function TuningAid({
  source: givenSource,
  analyzer = measurePianoNote,
  readingIntervalMs = 250,
  onRestart,
}: PianoTuningAidPageProps & { onRestart: () => void }) {
  const [session, dispatch] = useReducer(tuningReducer, undefined, loadSession);
  const sourceRef = useRef<SampleSource | null>(givenSource ?? null);
  const [micError, setMicError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [measureError, setMeasureError] = useState<string | null>(null);
  const [check, setCheck] = useState<{ verdict: CheckVerdict; beatHz: number } | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(TUNING_SESSION_KEY, serializeSession(session));
    } catch {
      // storage full or blocked: the session still works for this visit
    }
  }, [session]);

  useEffect(() => () => sourceRef.current?.stop(), []);

  const ensureSource = useCallback(async (): Promise<SampleSource | null> => {
    try {
      if (!sourceRef.current) sourceRef.current = createMicSampleSource();
      await sourceRef.current.start();
      setMicError(null);
      return sourceRef.current;
    } catch {
      setMicError("Microphone access was blocked. Allow the microphone for Music Portal in your browser or system settings, then try again.");
      return null;
    }
  }, []);

  const curve = useMemo(() => curveForSession(session), [session.samples, session.tuneA4Hz, session.lowestMidi, session.highestMidi]);
  const target = session.phase === "tune" ? currentTarget(session, curve) : null;
  const plan = useMemo(() => (session.phase === "plan" ? planSummary(session) : null), [session.phase, session.samples, session.a4Hz]);

  // Live readings for the steps where one string sounds.
  const liveActive = session.acknowledged && session.phase === "tune" && !session.stopNotice && target !== null && isPitchSubstep(session.substep);
  useEffect(() => {
    if (!liveActive || !target) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    void ensureSource().then((src) => {
      if (!src || cancelled) return;
      timer = setInterval(() => {
        const block = src.latest(Math.round(src.sampleRate * LIVE_BLOCK_S));
        if (block.length < src.sampleRate * 0.3) return;
        const r = measureLivePitch(block, src.sampleRate, target.aimHz, target.inharmonicityB, target.listenPartial);
        if (r) dispatch({ type: "READING", cents: r.cents, atMs: Date.now() });
      }, readingIntervalMs);
    });
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [liveActive, target?.midi, target?.aimHz, session.substep, readingIntervalMs, ensureSource]);

  useEffect(() => setCheck(null), [session.index, session.substep, session.pass]);

  const act = (a: FlowAction) => dispatch(a);

  async function measureSample() {
    const midi = session.sampleNotes[session.measureIndex];
    const src = await ensureSource();
    if (!src || midi === undefined) return;
    setBusy(true);
    setMeasureError(null);
    try {
      const samples = await src.capture(MEASURE_MS, 300);
      const m = analyzer(samples, src.sampleRate, midi, { a4Hz: session.a4Hz, searchCents: 200 });
      if (m && m.confidence >= MIN_SAMPLE_CONFIDENCE) act({ type: "RECORD_SAMPLE", measurement: m });
      else setMeasureError(`Could not hear ${noteName(midi)} clearly. Play it a bit louder, let it ring, and try again.`);
    } finally {
      setBusy(false);
    }
  }

  async function runCheck(kind: "unison" | "octave") {
    if (!target) return;
    const src = await ensureSource();
    if (!src) return;
    setBusy(true);
    try {
      const samples = await src.capture(CHECK_MS, 300);
      const b = target.inharmonicityB;
      const f0 = target.aimHz / Math.sqrt(1 + b);
      let n = target.listenPartial;
      if (kind === "octave") {
        const match = curve.targets[target.midi]?.match;
        if (match) n = target.partnerMidi !== undefined && target.partnerMidi < target.midi ? match.high : match.low;
      }
      const reading = detectBeats(samples, src.sampleRate, partialHz(f0, b, n));
      setCheck({ verdict: unisonVerdict(reading), beatHz: reading.beatHz });
    } finally {
      setBusy(false);
    }
  }

  function startOver() {
    const fresh = createSession({ a4Hz: readReferenceA4() });
    try {
      localStorage.setItem(TUNING_SESSION_KEY, serializeSession(fresh));
    } catch {
      // ignore
    }
    onRestart();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Piano tuning aid</h1>
        {session.acknowledged && (
          <Button size="sm" variant="plain" onClick={startOver}>
            Start over
          </Button>
        )}
      </header>

      {!session.acknowledged ? (
        <SafetyNote onAcknowledge={() => act({ type: "ACKNOWLEDGE_SAFETY", understood: true })} />
      ) : (
        <>
          {micError && (
            <Card role="alert" className="text-sm">
              {micError}
            </Card>
          )}

          {session.stopNotice ? (
            <Card as="section" role="alert" className="space-y-3">
              <h2 className="text-lg font-semibold">Stopped guiding {noteName(session.stopNotice.midi)}</h2>
              <p className="text-sm">
                The tuning aid has stopped on this note because {STOP_REASON_TEXT[session.stopNotice.reason]}. Do not keep turning
                the pin. This usually needs a technician's hands (for example a loose pin or a pin block problem).
              </p>
              <TechnicianRecommendation />
              <Button variant="filled" onClick={() => act({ type: "DISMISS_STOP_NOTICE" })}>
                Leave this note and continue
              </Button>
            </Card>
          ) : session.phase === "measure" ? (
            <MeasureStep session={session} busy={busy} error={measureError} onMeasure={measureSample} dispatch={dispatch} />
          ) : session.phase === "plan" && plan ? (
            <Card as="section" className="space-y-3">
              <h2 className="text-lg font-semibold">Your piano's tuning plan</h2>
              <p className="text-sm">
                Based on {plan.usableSamples} measured notes{plan.usableSamples < 3 ? " (too few: using a typical piano's curve)" : ""}, the
                app has computed a stretch curve for this piano. On average it is{" "}
                <strong>
                  {Math.abs(plan.pitchLevelCents).toFixed(0)} cents {plan.pitchLevelCents < 0 ? "flat" : "sharp"}
                </strong>{" "}
                of that curve at A4 = {session.a4Hz} Hz.
              </p>
              <p className="text-sm opacity-80">
                Order: A4 and the temperament octave first, then up the treble by octaves, then down the bass.
              </p>
              {plan.advice === "professional" ? (
                <div className="space-y-2 text-sm">
                  <p className="font-semibold">
                    This piano is far below pitch. Raising it that far puts heavy extra load on strings and frame and should be done
                    by a technician, sometimes over several visits. The tuning aid will not guide it.
                  </p>
                  <TechnicianRecommendation />
                </div>
              ) : plan.advice === "pitch-raise" ? (
                <div className="space-y-2 text-sm">
                  <p>
                    A <strong>pitch raise</strong> is needed: a rough pass with a small overpull, then a fine pass.
                  </p>
                  <p className="font-semibold">
                    Warning: a pitch raise adds a lot of stress to old strings. Strings can break. Wear eye protection and consider a
                    technician.
                  </p>
                  <Button variant="filled" onClick={() => act({ type: "CHOOSE_MODE", mode: "pitch-raise" })}>
                    Start pitch raise (two passes)
                  </Button>
                </div>
              ) : (
                <Button variant="filled" onClick={() => act({ type: "CHOOSE_MODE", mode: "fine" })}>
                  Start fine tuning
                </Button>
              )}
              {plan.pitchLevelCents < -5 && (
                <div className="text-sm">
                  <Button variant="tinted" onClick={() => act({ type: "CHOOSE_MODE", mode: "own-pitch" })}>
                    Tune at the piano's current pitch instead
                  </Button>
                  <p className="mt-1 opacity-80">Evens the piano out without raising it; it will not match other instruments at A4 = {session.a4Hz} Hz.</p>
                </div>
              )}
            </Card>
          ) : session.phase === "tune" && target ? (
            <TuneStep
              session={session}
              target={target}
              busy={busy}
              check={check}
              onCheck={runCheck}
              dispatch={dispatch}
            />
          ) : (
            <DoneStep session={session} />
          )}

          <footer className="border-t pt-3">
            <TechnicianRecommendation compact />
          </footer>
        </>
      )}
    </div>
  );
}

function MeasureStep({
  session,
  busy,
  error,
  onMeasure,
  dispatch,
}: {
  session: TuningSession;
  busy: boolean;
  error: string | null;
  onMeasure: () => void;
  dispatch: (a: FlowAction) => void;
}) {
  const midi = session.sampleNotes[session.measureIndex];
  const total = session.sampleNotes.length;
  return (
    <Card as="section" className="space-y-3">
      <h2 className="text-lg font-semibold">Step 1: measure your piano</h2>
      <p className="text-sm">
        The app measures how much this piano's strings stretch their partials (inharmonicity) on a few keys across the keyboard, and
        computes a tuning curve made for this piano. Music Portal listens through the microphone; sound is analysed on this device and
        never recorded or uploaded.
      </p>
      {midi !== undefined ? (
        <>
          <p className="text-sm" data-testid="measure-progress">
            Key {session.measureIndex + 1} of {total}
          </p>
          <p className="text-3xl font-semibold" data-testid="measure-note">
            {noteName(midi)}
          </p>
          <p className="text-sm">Play {noteName(midi)} firmly (mezzo-forte), then tap Listen and let the note ring.</p>
          {error && (
            <p role="alert" className="text-sm">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="filled" loading={busy} onClick={onMeasure}>
              Listen
            </Button>
            <Button onClick={() => dispatch({ type: "SKIP_SAMPLE" })}>Skip this key</Button>
            {session.measureIndex > 0 && <Button onClick={() => dispatch({ type: "REDO_SAMPLE" })}>Redo previous</Button>}
          </div>
        </>
      ) : (
        <p className="text-sm">All keys measured.</p>
      )}
      {(midi === undefined || session.samples.length >= 3) && (
        <Button variant={midi === undefined ? "filled" : "gray"} onClick={() => dispatch({ type: "FINISH_MEASURE" })}>
          {midi === undefined ? "See the tuning plan" : "Finish measuring now"}
        </Button>
      )}
    </Card>
  );
}

const REPORT_OPTIONS: { reason: StopReason; label: string }[] = [
  { reason: "will-not-hold", label: "It will not stay in tune" },
  { reason: "pin-too-loose", label: "The pin turns too easily" },
  { reason: "pitch-jumps", label: "The pitch jumps" },
  { reason: "other", label: "Something feels wrong" },
];

function TuneStep({
  session,
  target,
  busy,
  check,
  onCheck,
  dispatch,
}: {
  session: TuningSession;
  target: CurrentTarget;
  busy: boolean;
  check: { verdict: CheckVerdict; beatHz: number } | null;
  onCheck: (kind: "unison" | "octave") => void;
  dispatch: (a: FlowAction) => void;
}) {
  const [reporting, setReporting] = useState(false);
  const step = session.substep;
  const pitchStep = isPitchSubstep(step);
  const inTune = session.live.cents !== null && Math.abs(session.live.cents) <= target.toleranceCents;
  const isUnison = step === "unison" || step === "unison-left" || step === "unison-right";
  const stepNo = target.substeps.indexOf(step) + 1;
  return (
    <Card as="section" className="space-y-4">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span data-testid="tune-progress">
          {session.pass === "rough" ? "Rough pass" : "Fine pass"}: note {session.index + 1} of {session.order.length}
        </span>
        <span>
          Step {stepNo} of {target.substeps.length}
        </span>
      </div>
      <div className="flex items-baseline gap-3">
        <h2 className="text-3xl font-semibold" data-testid="tune-note">
          {noteName(target.midi)}
        </h2>
        <span className="text-sm opacity-80 tabular-nums">
          target {target.aimHz.toFixed(2)} Hz
          {target.overpullCents > 0 ? ` (includes +${target.overpullCents.toFixed(1)} c overpull)` : ""}
        </span>
      </div>
      <p className="text-sm" data-testid="tune-instructions">
        {instructions(step, target)}
      </p>

      {pitchStep && <FineDisplay cents={session.live.cents} toleranceCents={target.toleranceCents} />}

      {(isUnison || step === "octave") && (
        <div className="space-y-2">
          <Button loading={busy} onClick={() => onCheck(step === "octave" ? "octave" : "unison")}>
            {step === "octave" ? "Check octave" : "Check unison"}
          </Button>
          {check && (
            <p className="text-sm" data-testid="check-result">
              {VERDICT_TEXT[check.verdict]}
              {check.verdict !== "clean" && check.beatHz > 0 ? ` About ${check.beatHz.toFixed(1)} beats per second.` : ""}
            </p>
          )}
        </div>
      )}

      {step === "mute" && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>Strings on this note:</span>
          {([1, 2, 3] as const).map((n) => (
            <Button
              key={n}
              size="sm"
              variant={target.strings === n ? "tinted" : "gray"}
              aria-pressed={target.strings === n}
              onClick={() => dispatch({ type: "SET_STRINGS", midi: target.midi, strings: n })}
            >
              {n}
            </Button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant={!pitchStep || inTune ? "filled" : "gray"} onClick={() => dispatch({ type: "NEXT_SUBSTEP" })}>
          {stepNo === target.substeps.length ? "Note done" : "Next step"}
        </Button>
        <Button onClick={() => dispatch({ type: "SKIP_NOTE" })}>Skip note</Button>
        <Button variant="plain" onClick={() => setReporting((r) => !r)} aria-expanded={reporting}>
          Report a problem
        </Button>
      </div>
      {reporting && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="What went wrong">
          {REPORT_OPTIONS.map((o) => (
            <Button key={o.reason} size="sm" onClick={() => dispatch({ type: "REPORT_PROBLEM", reason: o.reason })}>
              {o.label}
            </Button>
          ))}
        </div>
      )}
    </Card>
  );
}

function DoneStep({ session }: { session: TuningSession }) {
  const summary = summarizeSession(session);
  return (
    <Card as="section" className="space-y-3">
      <h2 className="text-lg font-semibold">Tuning finished</h2>
      <p className="text-sm">
        {summary.done} notes tuned{summary.skipped ? `, ${summary.skipped} skipped` : ""}. A fresh tuning settles over the next days;
        run the Piano check in a week or two to see how it is holding.
      </p>
      {summary.stopped.length > 0 && (
        <div className="space-y-1 text-sm">
          <p className="font-semibold">Notes that need a technician:</p>
          <ul className="list-disc pl-5">
            {summary.stopped.map((s) => (
              <li key={s.midi}>
                {noteName(s.midi)}: {STOP_REASON_TEXT[s.reason]}
              </li>
            ))}
          </ul>
        </div>
      )}
      {summary.recommendTechnician && <TechnicianRecommendation />}
    </Card>
  );
}
