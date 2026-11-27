import { describe, expect, it } from "vitest";
import {
  createSession, currentTarget, curveForSession, equalTemperamentHz, inharmonicityAt, measureLivePitch, measurePianoNote,
  parseSession, planSummary, serializeSession, shiftCents, summarizeSession, synthPianoTone, tuningReducer,
  TYPICAL_INHARMONICITY, type FlowAction, type TuningSession,
} from "./index.js";

const SR = 48000;
const run = (s: TuningSession, ...actions: FlowAction[]) => actions.reduce(tuningReducer, s);
const ack = (s = createSession()) => run(s, { type: "ACKNOWLEDGE_SAFETY", understood: true });

/** Measures every sample note of a synthetic piano that is `levelCents` off the stretch curve. */
function measureAll(session: TuningSession, levelCents: number): TuningSession {
  const curve = curveForSession(session);
  let s = session;
  for (const midi of session.sampleNotes) {
    const b = inharmonicityAt(TYPICAL_INHARMONICITY, midi);
    const tone = synthPianoTone({ midi, pitchHz: shiftCents(curve.targets[midi].targetHz, levelCents + ((midi % 5) - 2) * 0.5), inharmonicityB: b, partials: 16, fundamentalLevel: midi < 40 ? 0.3 : 1, snrDb: 30, seed: midi });
    s = run(s, { type: "RECORD_SAMPLE", measurement: measurePianoNote(tone, SR, midi, { searchCents: 200 })! });
  }
  return run(s, { type: "FINISH_MEASURE" });
}

describe("safety gate", () => {
  it("ignores every guidance action until the safety note is acknowledged", () => {
    const s = createSession();
    const actions: FlowAction[] = [
      { type: "FINISH_MEASURE" }, { type: "CHOOSE_MODE", mode: "fine" }, { type: "SKIP_SAMPLE" },
      { type: "READING", cents: 0, atMs: 0 }, { type: "NEXT_SUBSTEP" }, { type: "ACKNOWLEDGE_SAFETY", understood: false },
    ];
    for (const a of actions) expect(tuningReducer(s, a)).toBe(s);
    expect(ack(s).acknowledged).toBe(true);
  });

  it("never stores the acknowledgement: a resumed session asks again", () => {
    const s = run(ack(), { type: "SKIP_SAMPLE" });
    const raw = serializeSession(s);
    expect(JSON.parse(raw).acknowledged).toBe(false);
    const resumed = parseSession(raw)!;
    expect(resumed.acknowledged).toBe(false);
    expect(resumed.measureIndex).toBe(1);
    expect(tuningReducer(resumed, { type: "SKIP_SAMPLE" })).toBe(resumed);
    expect(parseSession("{bad")).toBeNull();
    expect(parseSession(JSON.stringify({ version: 9 }))).toBeNull();
  });
});

describe("measure and plan", () => {
  it("measures samples and recommends a fine tuning for a piano close to pitch", () => {
    const s = measureAll(ack(), -6);
    expect(s.phase).toBe("plan");
    const plan = planSummary(s);
    expect(plan.usableSamples).toBe(s.sampleNotes.length);
    expect(plan.pitchLevelCents).toBeGreaterThan(-7);
    expect(plan.pitchLevelCents).toBeLessThan(-5);
    expect(plan.advice).toBe("fine-tune");
  });

  it("recommends a pitch raise for a piano 40 cents flat and starts with a rough pass with overpull", () => {
    const s = measureAll(ack(), -40);
    expect(planSummary(s).advice).toBe("pitch-raise");
    const t = run(s, { type: "CHOOSE_MODE", mode: "pitch-raise" });
    expect(t.pass).toBe("rough");
    expect(t.substep).toBe("rough");
    const target = currentTarget(t)!;
    expect(target.overpullCents).toBeCloseTo(10, 0);
    expect(target.aimHz).toBeGreaterThan(target.targetHz);
  });

  it("refuses to guide a pitch raise on a piano far below pitch but can tune it at its own level", () => {
    const s = measureAll(ack(), -150);
    expect(planSummary(s).advice).toBe("professional");
    expect(run(s, { type: "CHOOSE_MODE", mode: "pitch-raise" })).toBe(s);
    const own = run(s, { type: "CHOOSE_MODE", mode: "own-pitch" });
    expect(own.phase).toBe("tune");
    expect(own.pass).toBe("fine");
    expect(1200 * Math.log2(own.tuneA4Hz / 440)).toBeCloseTo(-150, 0);
    expect(summarizeSession(own).recommendTechnician).toBe(true);
  });

  it("ignores a sample for the wrong key and supports skip and redo", () => {
    const s = ack();
    const wrong = measurePianoNote(synthPianoTone({ midi: 60, inharmonicityB: 4e-4 }), SR, 60)!;
    expect(run(s, { type: "RECORD_SAMPLE", measurement: wrong })).toBe(s);
    const skipped = run(s, { type: "SKIP_SAMPLE" }, { type: "SKIP_SAMPLE" }, { type: "REDO_SAMPLE" });
    expect(skipped.measureIndex).toBe(1);
  });

  it("limits the range to a short keyboard", () => {
    const s = run(ack(), { type: "SET_RANGE", lowestMidi: 28, highestMidi: 103 });
    expect(s.sampleNotes[0]).toBeGreaterThanOrEqual(28);
    expect(Math.max(...s.sampleNotes)).toBeLessThanOrEqual(103);
    const t = run(s, { type: "FINISH_MEASURE" }, { type: "CHOOSE_MODE", mode: "fine" });
    expect(t.order).toHaveLength(103 - 28 + 1);
  });
});

describe("guided tuning steps", () => {
  const start = () => run(ack(), { type: "FINISH_MEASURE" }, { type: "CHOOSE_MODE", mode: "fine" });

  it("guides a trichord: mute side strings, centre string, then each unison; no octave for A4", () => {
    const s = start();
    expect(s.order[0]).toBe(69);
    expect(currentTarget(s)!.substeps).toEqual(["mute", "centre", "unison-left", "unison-right"]);
    expect(currentTarget(s)!.toleranceCents).toBe(1);
    let t = s;
    for (let i = 0; i < 4; i++) t = run(t, { type: "NEXT_SUBSTEP" });
    expect(t.notes[69].status).toBe("done");
    expect(t.order[t.index]).toBe(57);
    expect(currentTarget(t)!.substeps).toEqual(["mute", "centre", "unison-left", "unison-right", "octave"]);
  });

  it("uses single and paired strings in the bass and lets the owner correct the count", () => {
    let s = start();
    s = { ...s, index: s.order.indexOf(40) };
    s = { ...s, notes: { ...s.notes, [52]: { status: "done" } } };
    expect(currentTarget(s)!.substeps).toEqual(["mute", "first", "unison", "octave"]);
    s = run(s, { type: "SET_STRINGS", midi: 40, strings: 1 });
    expect(currentTarget(s)!.substeps).toEqual(["single", "octave"]);
    expect(currentTarget({ ...s, index: s.order.indexOf(21) })!.substeps[0]).toBe("single");
  });

  it("goes from the rough pass to the fine pass and then finishes", () => {
    let s = run(measureAll(ack(createSession({ lowestMidi: 57, highestMidi: 69 })), -40), { type: "CHOOSE_MODE", mode: "pitch-raise" });
    expect(s.order).toHaveLength(13);
    for (let i = 0; i < 13; i++) s = run(s, { type: "NEXT_SUBSTEP" });
    expect(s.pass).toBe("fine");
    expect(s.index).toBe(0);
    expect(currentTarget(s)!.overpullCents).toBe(0);
    for (let guard = 0; guard < 200 && s.phase === "tune"; guard++) s = run(s, { type: "NEXT_SUBSTEP" });
    expect(s.phase).toBe("done");
    expect(summarizeSession(s).done).toBe(13);
  });

  it("drives the live display from synthetic tones at, above and below target", () => {
    const s = start();
    const target = currentTarget(s)!;
    for (const off of [-8, -0.6, 0, 2.5]) {
      const tone = synthPianoTone({ midi: 69, pitchHz: shiftCents(target.aimHz, off), inharmonicityB: target.inharmonicityB, durationS: 0.6, snrDb: 30 });
      const r = measureLivePitch(tone, SR, target.aimHz, target.inharmonicityB, target.listenPartial)!;
      expect(Math.abs(r.cents - off)).toBeLessThan(0.2);
    }
    expect(target.aimHz).toBe(equalTemperamentHz(69));
  });
});

describe("stop conditions", () => {
  const atCentre = () => run(ack(), { type: "FINISH_MEASURE" }, { type: "CHOOSE_MODE", mode: "fine" }, { type: "NEXT_SUBSTEP" });

  it("stops guiding a note the owner reports, recommends a technician, and moves on", () => {
    const s = run(atCentre(), { type: "REPORT_PROBLEM", reason: "pin-too-loose" });
    expect(s.stopNotice).toEqual({ midi: 69, reason: "pin-too-loose" });
    expect(s.notes[69].status).toBe("stopped");
    expect(run(s, { type: "NEXT_SUBSTEP" })).toBe(s);
    expect(run(s, { type: "READING", cents: 0, atMs: 1 })).toBe(s);
    const next = run(s, { type: "DISMISS_STOP_NOTICE" });
    expect(next.stopNotice).toBeNull();
    expect(next.order[next.index]).toBe(57);
    expect(summarizeSession(next).recommendTechnician).toBe(true);
    expect(summarizeSession(next).stopped).toEqual([{ midi: 69, reason: "pin-too-loose" }]);
  });

  it("stops automatically when the pitch jumps unpredictably", () => {
    let s = atCentre();
    const readings = [0, 30, -5, 28, -10, 25];
    readings.forEach((c, i) => { s = run(s, { type: "READING", cents: c, atMs: i * 200 }); });
    expect(s.stopNotice?.reason).toBe("pitch-jumps");
  });

  it("stops automatically when a settled note will not hold", () => {
    let s = atCentre();
    let t = 0;
    const feed = (values: number[]) => { for (const c of values) s = run(s, { type: "READING", cents: c, atMs: (t += 300) }); };
    feed([-12, -6, -2, -0.4, -0.6, -1.2, -1.9, -2.7, -3.6]); // reached, then crept flat
    expect(s.live.driftEvents).toBe(1);
    expect(s.stopNotice).toBeNull();
    feed([-0.2, -0.5, -1.4, -2.3, -3.1, -3.9]); // brought back up, crept again
    expect(s.stopNotice?.reason).toBe("will-not-hold");
  });

  it("does not mistake normal lever work for drift", () => {
    let s = atCentre();
    [-20, -10, -3, 2, -4, -0.5, 0.3, 0.1].forEach((c, i) => { s = run(s, { type: "READING", cents: c, atMs: i * 300 }); });
    expect(s.stopNotice).toBeNull();
    expect(s.live.reached).toBe(true);
  });

  it("skips stopped notes in the fine pass after a pitch raise", () => {
    let s = run(measureAll(ack(createSession({ lowestMidi: 57, highestMidi: 69 })), -40), { type: "CHOOSE_MODE", mode: "pitch-raise" });
    s = run(s, { type: "REPORT_PROBLEM", reason: "will-not-hold" }, { type: "DISMISS_STOP_NOTICE" });
    for (let i = 0; i < 12; i++) s = run(s, { type: "NEXT_SUBSTEP" });
    expect(s.pass).toBe("fine");
    expect(s.order[s.index]).toBe(57);
    expect(s.notes[69].status).toBe("stopped");
  });
});
