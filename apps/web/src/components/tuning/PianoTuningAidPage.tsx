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
import { t, tRich, useT } from "../../i18n";
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

const STOP_REASON_KEY: Record<StopReason, string> = {
  "will-not-hold": "willNotHold",
  "pin-too-loose": "pinTooLoose",
  "pitch-jumps": "pitchJumps",
  other: "other",
};
const stopReasonText = (reason: StopReason) => t(`tuningAid.reason.${STOP_REASON_KEY[reason]}`);

const VERDICT_TEXT: Record<CheckVerdict, string> = {
  get clean() { return t("tuningAid.verdict.clean"); },
  get "slow-beat"() { return t("tuningAid.verdict.slowBeat"); },
  get beating() { return t("tuningAid.verdict.beating"); },
};

const STEP_KEY: Record<Substep, string> = {
  rough: "rough",
  mute: "mute",
  centre: "centre",
  first: "first",
  single: "single",
  "unison-left": "unisonLeft",
  "unison-right": "unisonRight",
  unison: "unison",
  octave: "octave",
};

function instructions(step: Substep, target: CurrentTarget): string {
  const name = noteName(target.midi);
  const partner = target.partnerMidi !== undefined ? noteName(target.partnerMidi) : "";
  const key = step === "mute" ? (target.strings === 3 ? "muteThree" : "muteTwo") : STEP_KEY[step];
  return t(`tuningAid.step.${key}`, { note: name, partner });
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
  useT();
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
      setMicError(t("tuningAid.micBlocked"));
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
      else setMeasureError(t("tuningAid.notHeard", { note: noteName(midi) }));
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
        <h1 className="text-2xl font-semibold">{t("tuningAid.title")}</h1>
        {session.acknowledged && (
          <Button size="sm" variant="plain" onClick={startOver}>
            {t("tuningAid.startOver")}
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
              <h2 className="text-lg font-semibold">{t("tuningAid.stoppedTitle", { note: noteName(session.stopNotice.midi) })}</h2>
              <p className="text-sm">
                {t(`tuningAid.stopBecause.${STOP_REASON_KEY[session.stopNotice.reason]}`)} {t("tuningAid.stopAdvice")}
              </p>
              <TechnicianRecommendation />
              <Button variant="filled" onClick={() => act({ type: "DISMISS_STOP_NOTICE" })}>
                {t("tuningAid.leaveNote")}
              </Button>
            </Card>
          ) : session.phase === "measure" ? (
            <MeasureStep session={session} busy={busy} error={measureError} onMeasure={measureSample} dispatch={dispatch} />
          ) : session.phase === "plan" && plan ? (
            <Card as="section" className="space-y-3">
              <h2 className="text-lg font-semibold">{t("tuningAid.plan.title")}</h2>
              <p className="text-sm">
                {tRich(plan.usableSamples < 3 ? "tuningAid.plan.basedFew" : "tuningAid.plan.based", {
                  count: plan.usableSamples,
                  offset: t(plan.pitchLevelCents < 0 ? "tuner.centsFlat" : "tuner.centsSharp", { cents: Math.abs(plan.pitchLevelCents).toFixed(0) }),
                  a4: session.a4Hz,
                  strong: (c) => <strong>{c}</strong>,
                })}
              </p>
              <p className="text-sm opacity-80">
                {t("tuningAid.plan.order")}
              </p>
              {plan.advice === "professional" ? (
                <div className="space-y-2 text-sm">
                  <p className="font-semibold">
                    {t("tuningAid.plan.professional")}
                  </p>
                  <TechnicianRecommendation />
                </div>
              ) : plan.advice === "pitch-raise" ? (
                <div className="space-y-2 text-sm">
                  <p>
                    {tRich("tuningAid.plan.pitchRaise", { strong: (c) => <strong>{c}</strong> })}
                  </p>
                  <p className="font-semibold">
                    {t("tuningAid.plan.warning")}
                  </p>
                  <Button variant="filled" onClick={() => act({ type: "CHOOSE_MODE", mode: "pitch-raise" })}>
                    {t("tuningAid.plan.startRaise")}
                  </Button>
                </div>
              ) : (
                <Button variant="filled" onClick={() => act({ type: "CHOOSE_MODE", mode: "fine" })}>
                  {t("tuningAid.plan.startFine")}
                </Button>
              )}
              {plan.pitchLevelCents < -5 && (
                <div className="text-sm">
                  <Button variant="tinted" onClick={() => act({ type: "CHOOSE_MODE", mode: "own-pitch" })}>
                    {t("tuningAid.plan.ownPitch")}
                  </Button>
                  <p className="mt-1 opacity-80">{t("tuningAid.plan.ownPitchHint", { a4: session.a4Hz })}</p>
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
      <h2 className="text-lg font-semibold">{t("tuningAid.measure.title")}</h2>
      <p className="text-sm">
        {t("tuningAid.measure.intro")}
      </p>
      {midi !== undefined ? (
        <>
          <p className="text-sm" data-testid="measure-progress">
            {t("tuningAid.measure.progress", { n: session.measureIndex + 1, total })}
          </p>
          <p className="text-3xl font-semibold" data-testid="measure-note">
            {noteName(midi)}
          </p>
          <p className="text-sm">{t("tuningAid.measure.play", { note: noteName(midi) })}</p>
          {error && (
            <p role="alert" className="text-sm">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="filled" loading={busy} onClick={onMeasure}>
              {t("tuningAid.measure.listen")}
            </Button>
            <Button onClick={() => dispatch({ type: "SKIP_SAMPLE" })}>{t("tuningAid.measure.skipKey")}</Button>
            {session.measureIndex > 0 && <Button onClick={() => dispatch({ type: "REDO_SAMPLE" })}>{t("tuningAid.measure.redoPrevious")}</Button>}
          </div>
        </>
      ) : (
        <p className="text-sm">{t("tuningAid.measure.allDone")}</p>
      )}
      {(midi === undefined || session.samples.length >= 3) && (
        <Button variant={midi === undefined ? "filled" : "gray"} onClick={() => dispatch({ type: "FINISH_MEASURE" })}>
          {midi === undefined ? t("tuningAid.measure.seePlan") : t("tuningAid.measure.finishNow")}
        </Button>
      )}
    </Card>
  );
}

const REPORT_OPTIONS: { reason: StopReason; label: string }[] = [
  { reason: "will-not-hold", get label() { return t("tuningAid.report.willNotHold"); } },
  { reason: "pin-too-loose", get label() { return t("tuningAid.report.pinTooLoose"); } },
  { reason: "pitch-jumps", get label() { return t("tuningAid.report.pitchJumps"); } },
  { reason: "other", get label() { return t("tuningAid.report.other"); } },
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
          {t(session.pass === "rough" ? "tuningAid.tune.roughProgress" : "tuningAid.tune.fineProgress", { n: session.index + 1, total: session.order.length })}
        </span>
        <span>
          {t("tuningAid.tune.step", { n: stepNo, total: target.substeps.length })}
        </span>
      </div>
      <div className="flex items-baseline gap-3">
        <h2 className="text-3xl font-semibold" data-testid="tune-note">
          {noteName(target.midi)}
        </h2>
        <span className="text-sm opacity-80 tabular-nums">
          {t("tuningAid.tune.target", { hz: target.aimHz.toFixed(2) })}
          {target.overpullCents > 0 ? ` ${t("tuningAid.tune.overpull", { cents: target.overpullCents.toFixed(1) })}` : ""}
        </span>
      </div>
      <p className="text-sm" data-testid="tune-instructions">
        {instructions(step, target)}
      </p>

      {pitchStep && <FineDisplay cents={session.live.cents} toleranceCents={target.toleranceCents} />}

      {(isUnison || step === "octave") && (
        <div className="space-y-2">
          <Button loading={busy} onClick={() => onCheck(step === "octave" ? "octave" : "unison")}>
            {step === "octave" ? t("tuningAid.tune.checkOctave") : t("tuningAid.tune.checkUnison")}
          </Button>
          {check && (
            <p className="text-sm" data-testid="check-result">
              {VERDICT_TEXT[check.verdict]}
              {check.verdict !== "clean" && check.beatHz > 0 ? ` ${t("tuningAid.tune.beats", { beats: check.beatHz.toFixed(1) })}` : ""}
            </p>
          )}
        </div>
      )}

      {step === "mute" && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>{t("tuningAid.tune.stringsOnNote")}</span>
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
          {stepNo === target.substeps.length ? t("tuningAid.tune.noteDone") : t("tuningAid.tune.nextStep")}
        </Button>
        <Button onClick={() => dispatch({ type: "SKIP_NOTE" })}>{t("tuningAid.tune.skipNote")}</Button>
        <Button variant="plain" onClick={() => setReporting((r) => !r)} aria-expanded={reporting}>
          {t("tuningAid.tune.report")}
        </Button>
      </div>
      {reporting && (
        <div className="flex flex-wrap gap-2" role="group" aria-label={t("tuningAid.tune.whatWrong")}>
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
      <h2 className="text-lg font-semibold">{t("tuningAid.done.title")}</h2>
      <p className="text-sm">
        {t(summary.skipped ? "tuningAid.done.summarySkipped" : "tuningAid.done.summary", { done: summary.done, skipped: summary.skipped })}
      </p>
      {summary.stopped.length > 0 && (
        <div className="space-y-1 text-sm">
          <p className="font-semibold">{t("tuningAid.done.needTechnician")}</p>
          <ul className="list-disc pl-5">
            {summary.stopped.map((s) => (
              <li key={s.midi}>
                {noteName(s.midi)}: {stopReasonText(s.reason)}
              </li>
            ))}
          </ul>
        </div>
      )}
      {summary.recommendTechnician && <TechnicianRecommendation />}
    </Card>
  );
}
