import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_A4_HZ, PIANO_SAFETY_NOTE, PIANO_TECHNICIAN_RECOMMENDATION, VERDICT_TEXT,
  analyseCheck, buildNoteList, compareReports, levelText, loadReports, makeReport, measureNote, midiName,
  pickSteadyPart, saveReport, FULL_RANGE,
  type Band, type CheckMode, type NoteMeasurement, type PianoCheckReport,
} from "@keyboard-sensei/piano-check";
import { Button, Card, SegmentedControl } from "../ui";
import KeyboardMap from "./KeyboardMap";
import { NoteListener, openMic, type MicCapture } from "./micCapture";

type Phase = "intro" | "measuring" | "results";

const PROBLEM_TEXT: Record<string, string> = {
  too_quiet: "That was too quiet. Play a little firmer (mezzo-forte) and let it ring.",
  clipped: "That was too loud and distorted. Play a little softer or move the device back.",
  too_short: "The note faded too fast. Hold the key down and let it ring.",
  unclear: "I could not hear that note clearly. Try again.",
};

const BAND_LABEL: Record<Band, string> = { green: "in tune", amber: "a bit off", red: "out of tune" };

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
      setError("Fewer than 3 notes were measured, which is not enough for a result. Try again and play each key shown.");
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
      setError("Music Portal needs microphone access to measure your piano. Allow it in your browser or device settings and try again.");
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
      <div className="mx-auto max-w-3xl space-y-4 p-4">
        <h1 className="text-2xl font-semibold">Piano check</h1>
        <p>
          Find out which notes on your acoustic piano are out of tune, and by how many cents, so you can decide whether to call a technician.
          This is a measurement only: no tuning instructions. Your microphone audio is analysed on this device and is not recorded or uploaded.
        </p>
        <Card>
          <div className="space-y-3 p-4">
            <SegmentedControl
              value={mode}
              onChange={(v) => setMode(v as CheckMode)}
              options={[
                { value: "quick", label: "Quick check (about 3 min)" },
                { value: "full", label: "Full check" },
              ]}
              aria-label="Check type"
            />
            <label className="flex items-center gap-2">
              A4 =
              <input type="number" min={415} max={466} step={0.5} value={a4}
                onChange={(e) => setA4(Math.min(466, Math.max(415, Number(e.target.value) || DEFAULT_A4_HZ)))}
                className="w-24 rounded border px-2 py-1" aria-label="A4 reference in Hz" /> Hz
            </label>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span>Short keyboard? Lowest key</span>
              <input type="number" min={21} max={high - 1} value={low} onChange={(e) => setLow(Math.max(21, Math.min(high - 1, Number(e.target.value) || 21)))}
                className="w-20 rounded border px-2 py-1" aria-label="Lowest key (MIDI number)" />
              <span>highest key</span>
              <input type="number" min={low + 1} max={108} value={high} onChange={(e) => setHigh(Math.min(108, Math.max(low + 1, Number(e.target.value) || 108)))}
                className="w-20 rounded border px-2 py-1" aria-label="Highest key (MIDI number)" />
              <span className="opacity-70">(MIDI numbers: A0 = 21, C8 = 108)</span>
            </div>
            <p className="text-sm opacity-80">
              Play each key shown, mezzo-forte, and let it ring. Keep the room quiet and put the device near the piano. {notes.length} notes.
            </p>
            {error && <p role="alert" className="text-red-600">{error}</p>}
            <Button variant="filled" size="lg" onClick={start}>Start</Button>
          </div>
        </Card>
        {reports.length > 0 && <PastReports reports={reports} />}
      </div>
    );
  }

  if (phase === "measuring") {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-4">
        <h1 className="text-2xl font-semibold">Play {current !== null ? midiName(current) : ""}</h1>
        <p aria-live="polite">Note {index + 1} of {notes.length}. Play it mezzo-forte and let it ring.</p>
        <KeyboardMap low={Math.max(21, low)} high={Math.min(108, high)} current={current}
          bands={new Map([...measured.keys()].map((m) => [m, "green" as Band]))} />
        {message && <p role="alert" className="text-amber-700">{message}</p>}
        <div className="flex flex-wrap gap-2">
          <Button onClick={redo}>Redo</Button>
          <Button onClick={back} disabled={index === 0}>Back</Button>
          <Button onClick={skip}>Skip</Button>
          <Button variant="plain" onClick={() => { stopMic(); setPhase("intro"); }}>Cancel</Button>
        </div>
      </div>
    );
  }

  const r = report!;
  const previous = reports.find((x) => x.id !== r.id && x.a4 === r.a4);
  const cmp = previous ? compareReports(previous, r) : null;
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <h1 className="text-2xl font-semibold">Piano check results</h1>
      <Card>
        <div className="space-y-1 p-4">
          <p className="text-lg font-medium">{VERDICT_TEXT[r.summary.verdict]}</p>
          <p>{levelText(r.summary.levelCents)}</p>
          <p className="text-sm opacity-80">
            Compared with {r.summary.target === "stretch_derived" ? "a stretch curve built from your piano's own measurements" :
              r.summary.target === "stretch_typical" ? "a typical piano stretch curve" : "equal temperament"} at A4 = {r.a4} Hz.
            A well-tuned piano is slightly stretched, so the top and bottom notes are judged against the stretch, not plain equal temperament.
          </p>
          {cmp && <p className="text-sm">Since your last check ({new Date(previous!.createdAt).toLocaleDateString()}): overall pitch moved {cmp.levelChange >= 0 ? "+" : ""}{Math.round(cmp.levelChange)} cents.</p>}
        </div>
      </Card>
      <KeyboardMap low={Math.max(21, low)} high={Math.min(108, high)} bands={bands} />
      <p className="text-sm">Green: within 5 cents. Amber: 5 to 15 cents. Red: more than 15 cents.</p>
      <h2 className="text-xl font-semibold">Worst notes</h2>
      <ul>
        {r.summary.worst.map((w) => (
          <li key={w.midi}>{midiName(w.midi)}: {w.centsStretch > 0 ? "+" : ""}{w.centsStretch.toFixed(1)} cents</li>
        ))}
      </ul>
      <h2 className="text-xl font-semibold">All measured notes</h2>
      <table className="w-full text-left text-sm">
        <thead><tr><th>Note</th><th>vs stretch</th><th>vs equal temperament</th><th>Status</th></tr></thead>
        <tbody>
          {r.notes.map((n) => (
            <tr key={n.midi}>
              <td>{midiName(n.midi)}</td>
              <td>{n.centsStretch > 0 ? "+" : ""}{n.centsStretch.toFixed(1)} c</td>
              <td>{n.centsET > 0 ? "+" : ""}{n.centsET.toFixed(1)} c</td>
              <td>{BAND_LABEL[n.band]}{n.unisonSuspect ? ", unison may be out" : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Card>
        <div className="space-y-2 p-4">
          <h2 className="text-lg font-semibold">Before you touch a tuning pin</h2>
          <p className="text-sm">{PIANO_SAFETY_NOTE}</p>
          <p className="text-sm font-medium">{PIANO_TECHNICIAN_RECOMMENDATION}</p>
        </div>
      </Card>
      <p className="text-sm opacity-80">This report is saved on this device so you can compare before and after a technician's visit.</p>
      <Button variant="filled" onClick={() => { setPhase("intro"); setReport(null); }}>Done</Button>
    </div>
  );
}

function PastReports({ reports }: { reports: PianoCheckReport[] }) {
  return (
    <section>
      <h2 className="text-lg font-semibold">Past checks</h2>
      <ul className="text-sm">
        {reports.map((r) => (
          <li key={r.id}>
            {new Date(r.createdAt).toLocaleDateString()}: {r.mode === "quick" ? "quick" : "full"} check, {levelText(r.summary.levelCents).toLowerCase()} {VERDICT_TEXT[r.summary.verdict]}
          </li>
        ))}
      </ul>
    </section>
  );
}
