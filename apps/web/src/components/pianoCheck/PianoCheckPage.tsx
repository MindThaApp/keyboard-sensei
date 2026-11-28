import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_A4_HZ,
  analyseCheck, buildNoteList, compareReports, loadReports, makeReport, measureNote, midiName,
  pickSteadyPart, saveReport, FULL_RANGE,
  type Band, type CheckMode, type NoteMeasurement, type PianoCheckReport,
} from "@keyboard-sensei/piano-check";
import { t, useT } from "../../i18n";
import { Button, Card, SegmentedControl } from "../ui";
import KeyboardMap from "./KeyboardMap";
import { NoteListener, openMic, type MicCapture } from "./micCapture";

type Phase = "intro" | "measuring" | "results";

const PROBLEM_TEXT: Record<string, string> = {
  get too_quiet() { return t("pianoCheck.problem.tooQuiet"); },
  get clipped() { return t("pianoCheck.problem.clipped"); },
  get too_short() { return t("pianoCheck.problem.tooShort"); },
  get unclear() { return t("pianoCheck.problem.unclear"); },
};

const BAND_LABEL: Record<Band, string> = {
  get green() { return t("pianoCheck.band.green"); },
  get amber() { return t("pianoCheck.band.amber"); },
  get red() { return t("pianoCheck.band.red"); },
};

const VERDICT_TEXT: Record<PianoCheckReport["summary"]["verdict"], string> = {
  get good() { return t("pianoCheck.verdict.good"); },
  get tuning_helps() { return t("pianoCheck.verdict.tuning"); },
  get pitch_raise() { return t("pianoCheck.verdict.pitchRaise"); },
};

/** The piano-check package's levelText, through the catalogue. */
function levelText(levelCents: number): string {
  const r = Math.round(levelCents);
  if (Math.abs(r) < 2) return t("pianoCheck.levelOk");
  return t(r < 0 ? "pianoCheck.levelFlat" : "pianoCheck.levelSharp", { cents: Math.abs(r) });
}

function useReports() {
  const [reports, setReports] = useState<PianoCheckReport[]>(() => {
    try { return loadReports(localStorage); } catch { return []; }
  });
  const add = (r: PianoCheckReport) => {
    try { setReports(saveReport(localStorage, r)); } catch { setReports((x) => [r, ...x]); }
  };
  return { reports, add };
}

export default function PianoCheckPage() {
  useT();
  const [phase, setPhase] = useState<Phase>("intro");
  const [mode, setMode] = useState<CheckMode>("quick");
  const [a4, setA4] = useState(DEFAULT_A4_HZ);
  const [low, setLow] = useState(FULL_RANGE.low);
  const [high, setHigh] = useState(FULL_RANGE.high);
  const [index, setIndex] = useState(0);
  const [measured, setMeasured] = useState<Map<number, NoteMeasurement>>(new Map());
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<PianoCheckReport | null>(null);
  const { reports, add } = useReports();
  const micRef = useRef<MicCapture | null>(null);
  const listenerRef = useRef<NoteListener | null>(null);
  const notes = useMemo(() => buildNoteList(mode, { low, high }), [mode, low, high]);
  const current = notes[index] ?? null;
  const measuredRef = useRef<Map<number, NoteMeasurement>>(new Map());
  const stateRef = useRef({ current, a4, notes, index });
  stateRef.current = { current, a4, notes, index };

  const stopMic = useCallback(() => {
    micRef.current?.close();
    micRef.current = null;
    listenerRef.current = null;
  }, []);
  useEffect(() => stopMic, [stopMic]);

  const finish = useCallback((all: Map<number, NoteMeasurement>) => {
    stopMic();
    if (all.size < 3) {
      setError(t("pianoCheck.tooFew"));
      setPhase("intro");
      return;
    }
    const analysis = analyseCheck([...all.values()], stateRef.current.a4);
    const r = makeReport(analysis, mode);
    add(r);
    setReport(r);
    setPhase("results");
  }, [add, mode, stopMic]);

  const onCaptured = useCallback((samples: Float32Array) => {
    const { current: midi, a4: ref, notes: list, index: i } = stateRef.current;
    const sr = micRef.current?.sampleRate ?? 48000;
    if (midi === null) return;
    const cap = pickSteadyPart(samples, sr);
    if (!cap.part) { setMessage(PROBLEM_TEXT[cap.problem ?? "unclear"]); listenerRef.current?.reset(); return; }
    const m = measureNote(cap.part.samples, sr, midi, { a4: ref });
    if (!m) { setMessage(PROBLEM_TEXT.unclear); listenerRef.current?.reset(); return; }
    setMessage(null);
    const next = new Map(measuredRef.current).set(midi, m);
    measuredRef.current = next;
    setMeasured(next);
    if (i + 1 < list.length) setIndex(i + 1);
    else finish(next);
  }, [finish]);

  const start = async () => {
    setError(null);
    measuredRef.current = new Map();
    setMeasured(new Map());
    setIndex(0);
    setMessage(null);
    try {
      const mic = await openMic((c) => listenerRef.current?.push(c));
      listenerRef.current = new NoteListener(mic.sampleRate, (s) => onCaptured(s));
      micRef.current = mic;
      setPhase("measuring");
    } catch {
      setError(t("pianoCheck.micNeeded"));
    }
  };

  const redo = () => {
    listenerRef.current?.reset();
    setMessage(null);
  };
  const back = () => {
    if (index === 0) return;
    setIndex(index - 1);
    redo();
  };
  const skip = () => {
    if (index + 1 >= notes.length) { finish(measuredRef.current); return; }
    setIndex(index + 1);
    redo();
  };

  const bands = useMemo(() => {
    const out = new Map<number, Band>();
    for (const n of report?.notes ?? []) out.set(n.midi, n.band);
    return out;
  }, [report]);

  if (phase === "intro") {
    return (
      <main className="mx-auto max-w-3xl space-y-4 p-4">
        <h1 className="text-2xl font-semibold">{t("pianoCheck.title")}</h1>
        <p>{t("pianoCheck.introFull")}</p>
        <Card>
          <div className="space-y-3 p-4">
            <SegmentedControl
              value={mode}
              onChange={(v) => setMode(v as CheckMode)}
              options={[
                { value: "quick", label: t("pianoCheck.quickOption") },
                { value: "full", label: t("pianoCheck.full") },
              ]}
              aria-label={t("pianoCheck.checkType")}
            />
            <label className="flex items-center gap-2">
              {t("pianoCheck.a4Prefix")}
              <input type="number" min={415} max={466} step={0.5} value={a4}
                onChange={(e) => setA4(Math.min(466, Math.max(415, Number(e.target.value) || DEFAULT_A4_HZ)))}
                className="w-24 rounded border px-2 py-1" aria-label={t("pianoCheck.a4Label")} /> Hz
            </label>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span>{t("pianoCheck.lowestKey")}</span>
              <input type="number" min={21} max={high - 1} value={low} onChange={(e) => setLow(Math.max(21, Math.min(high - 1, Number(e.target.value) || 21)))}
                className="w-20 rounded border px-2 py-1" aria-label={t("pianoCheck.lowestKeyLabel")} />
              <span>{t("pianoCheck.highestKey")}</span>
              <input type="number" min={low + 1} max={108} value={high} onChange={(e) => setHigh(Math.min(108, Math.max(low + 1, Number(e.target.value) || 108)))}
                className="w-20 rounded border px-2 py-1" aria-label={t("pianoCheck.highestKeyLabel")} />
              <span className="opacity-70">{t("pianoCheck.midiNumbers")}</span>
            </div>
            <p className="text-sm opacity-80">
              {t("pianoCheck.howTo", { count: notes.length })}
            </p>
            {error && <p role="alert" className="text-red-600">{error}</p>}
            <Button variant="filled" size="lg" onClick={start}>{t("pianoCheck.start")}</Button>
          </div>
        </Card>
        {reports.length > 0 && <PastReports reports={reports} />}
      </main>
    );
  }

  if (phase === "measuring") {
    return (
      <main className="mx-auto max-w-3xl space-y-4 p-4">
        <h1 className="text-2xl font-semibold">{t("pianoCheck.playHeading", { note: current !== null ? midiName(current) : "" })}</h1>
        <p aria-live="polite">{t("pianoCheck.measuringHint", { n: index + 1, total: notes.length })}</p>
        <KeyboardMap low={Math.max(21, low)} high={Math.min(108, high)} current={current}
          bands={new Map([...measured.keys()].map((m) => [m, "green" as Band]))} />
        {message && <p role="alert" className="text-amber-700">{message}</p>}
        <div className="flex flex-wrap gap-2">
          <Button onClick={redo}>{t("pianoCheck.redoShort")}</Button>
          <Button onClick={back} disabled={index === 0}>{t("common.back")}</Button>
          <Button onClick={skip}>{t("common.skip")}</Button>
          <Button variant="plain" onClick={() => { stopMic(); setPhase("intro"); }}>{t("common.cancel")}</Button>
        </div>
      </main>
    );
  }

  const r = report!;
  const previous = reports.find((x) => x.id !== r.id && x.a4 === r.a4);
  const cmp = previous ? compareReports(previous, r) : null;
  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4">
      <h1 className="text-2xl font-semibold">{t("pianoCheck.resultsTitle")}</h1>
      <Card>
        <div className="space-y-1 p-4">
          <p className="text-lg font-medium">{VERDICT_TEXT[r.summary.verdict]}</p>
          <p>{levelText(r.summary.levelCents)}</p>
          <p className="text-sm opacity-80">
            {t(r.summary.target === "stretch_derived" ? "pianoCheck.comparedDerived" : r.summary.target === "stretch_typical" ? "pianoCheck.comparedTypical" : "pianoCheck.comparedEqual", { a4: r.a4 })}{" "}
            {t("pianoCheck.stretchExplain")}
          </p>
          {cmp && <p className="text-sm">{t("pianoCheck.sinceLast", { date: new Date(previous!.createdAt).toLocaleDateString(), change: `${cmp.levelChange >= 0 ? "+" : ""}${Math.round(cmp.levelChange)}` })}</p>}
        </div>
      </Card>
      <KeyboardMap low={Math.max(21, low)} high={Math.min(108, high)} bands={bands} />
      <p className="text-sm">{t("pianoCheck.legend")}</p>
      <h2 className="text-xl font-semibold">{t("pianoCheck.worstNotes")}</h2>
      <ul>
        {r.summary.worst.map((w) => (
          <li key={w.midi}>{midiName(w.midi)}: {t("tuner.cents", { cents: `${w.centsStretch > 0 ? "+" : ""}${w.centsStretch.toFixed(1)}` })}</li>
        ))}
      </ul>
      <h2 className="text-xl font-semibold">{t("pianoCheck.allNotes")}</h2>
      <table className="w-full text-left text-sm">
        <thead><tr><th>{t("pianoCheck.col.note")}</th><th>{t("pianoCheck.col.stretch")}</th><th>{t("pianoCheck.col.equal")}</th><th>{t("pianoCheck.col.status")}</th></tr></thead>
        <tbody>
          {r.notes.map((n) => (
            <tr key={n.midi}>
              <td>{midiName(n.midi)}</td>
              <td>{n.centsStretch > 0 ? "+" : ""}{n.centsStretch.toFixed(1)} c</td>
              <td>{n.centsET > 0 ? "+" : ""}{n.centsET.toFixed(1)} c</td>
              <td>{BAND_LABEL[n.band]}{n.unisonSuspect ? `, ${t("pianoCheck.unisonShort")}` : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Card>
        <div className="space-y-2 p-4">
          <h2 className="text-lg font-semibold">{t("pianoCheck.beforePin")}</h2>
          <p className="text-sm">{t("pianoCheck.safety.note")}</p>
          <p className="text-sm font-medium">{t("pianoCheck.safety.technician")}</p>
        </div>
      </Card>
      <p className="text-sm opacity-80">{t("pianoCheck.savedHint")}</p>
      <Button variant="filled" onClick={() => { setPhase("intro"); setReport(null); }}>{t("common.done")}</Button>
    </main>
  );
}

function PastReports({ reports }: { reports: PianoCheckReport[] }) {
  return (
    <section>
      <h2 className="text-lg font-semibold">{t("pianoCheck.pastChecks")}</h2>
      <ul className="text-sm">
        {reports.map((r) => (
          <li key={r.id}>
            {t("pianoCheck.pastItem", { date: new Date(r.createdAt).toLocaleDateString(), mode: r.mode, level: levelText(r.summary.levelCents), verdict: VERDICT_TEXT[r.summary.verdict] })}
          </li>
        ))}
      </ul>
    </section>
  );
}
