import { describe, expect, it } from "vitest";
import { FrameAnalyser, scaledSizes, ANALYSIS_PROFILES, type AnalysisProfileId } from "./analyser.js";
import { midiToFrequency } from "./pitch.js";
import { centreFrequency, velocityFromLevel } from "./segmenter.js";
import { detectNotes, NoteTracker, toTrackerFrame } from "./tracker.js";
import { scoreOnsets } from "./testing/metrics.js";
import { addNoise, bowedTone, concat, detune, karplusStrong, mix, pianoTone, pluckSequence, scale, silence, slurredBowed, whiteNoise } from "./testing/synth.js";

const SR = 48000;
const GUITAR_LINE = [40, 45, 50, 55, 59, 64, 64, 67, 52, 47, 43, 57];
const VIOLIN_LINE = [55, 57, 59, 60, 62, 64, 66, 67, 69, 71, 74, 76];

function bowedLine(midis: number[], options: { noteS?: number; gapS?: number; vibratoCents?: number; cents?: number[] } = {}) {
  const noteS = options.noteS ?? 0.45;
  const gapS = options.gapS ?? 0.05;
  const sounds = midis.map((midi, i) => ({
    startS: 0.25 + i * (noteS + gapS),
    samples: bowedTone({
      frequency: detune(midiToFrequency(midi), options.cents?.[i] ?? 0),
      durationS: noteS,
      vibratoHz: 5.5,
      vibratoCents: options.vibratoCents ?? 0,
      attackS: 0.05,
      seed: i + 1,
    }),
  }));
  return { samples: mix(sounds, 0.5 + midis.length * (noteS + gapS)), onsets: sounds.map(s => s.startS) };
}

describe("guitar plucks: onsets and notes", () => {
  for (const snr of [Infinity, 30, 20, 10]) {
    it(`SNR ${snr} dB: onset F-measure >= 0.9 within 50 ms, every note right`, () => {
      const cents = GUITAR_LINE.map((_, i) => ((i * 7) % 21) - 10);
      const line = pluckSequence(GUITAR_LINE, { cents });
      const signal = Number.isFinite(snr) ? addNoise(line.samples, snr, 40) : line.samples;
      const notes = detectNotes(signal, { sampleRate: SR, profile: "guitar" });
      const score = scoreOnsets(line.onsets, notes.map(n => n.startS), 0.05);
      expect(score.fMeasure).toBeGreaterThanOrEqual(0.9);
      expect(notes.map(n => n.midi)).toEqual(GUITAR_LINE);
      // Known detune recovered (sustained part).
      notes.forEach((note, i) => expect(Math.abs(note.cents - cents[i]!), `note ${i}`).toBeLessThan(snr >= 20 ? 1 : 2));
    });
  }

  it("the live (causal) path finds the same notes", () => {
    const line = pluckSequence(GUITAR_LINE);
    const live = detectNotes(addNoise(line.samples, 30), { sampleRate: SR, profile: "guitar", mode: "live" });
    expect(live.map(n => n.midi)).toEqual(GUITAR_LINE);
    expect(scoreOnsets(line.onsets, live.map(n => n.startS)).fMeasure).toBeGreaterThanOrEqual(0.9);
  });

  it("repeated same-pitch plucks are split by the re-attack", () => {
    const line = pluckSequence([52, 52, 52, 52], { noteS: 0.3, ringS: 0.6 });
    const notes = detectNotes(line.samples, { sampleRate: SR, profile: "guitar" });
    expect(notes.map(n => n.midi)).toEqual([52, 52, 52, 52]);
  });

  // A sympathetic open string about 14 dB under the melody, ringing on after it.
  it("a ringing open string under a melody does not add notes", () => {
    const melody = pluckSequence([64, 67, 69, 67], { startS: 0.5, noteS: 0.4 });
    const drone = scale(karplusStrong({ frequency: midiToFrequency(45), durationS: 2.2, decay: 0.999, seed: 99 }), 0.1);
    const signal = mix([{ startS: 0, samples: melody.samples }, { startS: 0.0, samples: drone }], 2.4);
    const notes = detectNotes(signal, { sampleRate: SR, profile: "guitar" });
    expect(notes.filter(n => n.startS > 0.45).map(n => n.midi)).toEqual([64, 67, 69, 67]);
  });

  it("plucks under the noise gate are ignored", () => {
    const line = pluckSequence([52, 57]);
    const quiet = scale(line.samples, 0.0005); // about -70 dBFS
    expect(detectNotes(quiet, { sampleRate: SR, profile: "guitar", gateDb: -60 })).toEqual([]);
  });
});

describe("violin: bowed notes, vibrato, slurs", () => {
  for (const snr of [30, 20, 10]) {
    it(`detached bowing at SNR ${snr} dB: onsets and intonation`, () => {
      const cents = VIOLIN_LINE.map((_, i) => (i % 2 ? 20 : -20) * (i % 3 === 0 ? 0 : 1));
      const line = bowedLine(VIOLIN_LINE, { cents });
      const notes = detectNotes(addNoise(line.samples, snr, 7), { sampleRate: SR, profile: "violin" });
      expect(notes.map(n => n.midi)).toEqual(VIOLIN_LINE);
      expect(scoreOnsets(line.onsets, notes.map(n => n.startS)).fMeasure).toBeGreaterThanOrEqual(0.9);
      notes.forEach((note, i) => expect(Math.abs(note.cents - cents[i]!), `note ${i}`).toBeLessThan(snr >= 20 ? 0.5 : 1));
    });
  }

  it("vibrato (±25 cents at 5.5 Hz) is not punished: the centre pitch is reported", () => {
    const cents = [0, 10, -15, 5, 0, -8];
    const line = bowedLine(VIOLIN_LINE.slice(0, 6), { vibratoCents: 25, cents, noteS: 0.6 });
    const notes = detectNotes(addNoise(line.samples, 30), { sampleRate: SR, profile: "violin" });
    expect(notes.map(n => n.midi)).toEqual(VIOLIN_LINE.slice(0, 6));
    notes.forEach((note, i) => expect(Math.abs(note.cents - cents[i]!), `note ${i}`).toBeLessThan(2));
  });

  it("slurred notes (no new attack) are segmented by the pitch change", () => {
    const midis = [62, 64, 66, 67, 69, 67, 66, 64];
    const slur = slurredBowed({ frequencies: midis.map(m => midiToFrequency(m)), noteS: 0.25 });
    const signal = concat(silence(0.2), slur, silence(0.3));
    const notes = detectNotes(addNoise(signal, 30), { sampleRate: SR, profile: "violin" });
    expect(notes.map(n => n.midi)).toEqual(midis);
    const truth = midis.map((_, i) => 0.2 + i * 0.25);
    expect(scoreOnsets(truth, notes.map(n => n.startS)).fMeasure).toBeGreaterThanOrEqual(0.9);
  });

  it("centreFrequency: median without vibrato, whole-cycle mean with it", () => {
    expect(centreFrequency([440, 441, 439, 440, 440])).toBe(440);
    const cycleFrames = 17;
    const wobble = Array.from({ length: 60 }, (_, i) => 440 * 2 ** ((30 * Math.sin((2 * Math.PI * i) / cycleFrames + 1)) / 1200));
    expect(Math.abs(1200 * Math.log2(centreFrequency(wobble) / 440))).toBeLessThan(1);
  });
});

describe("piano, single line", () => {
  it("piano-like tones across the lesson range", () => {
    const midis = [45, 52, 57, 60, 64, 67, 72, 79, 84, 91];
    const sounds = midis.map((midi, i) => ({ startS: 0.3 + i * 0.5, samples: pianoTone({ frequency: midiToFrequency(midi), durationS: 0.48 }) }));
    const signal = addNoise(mix(sounds, 0.6 + midis.length * 0.5), 30);
    const notes = detectNotes(signal, { sampleRate: SR, profile: "piano" });
    expect(notes.map(n => n.midi)).toEqual(midis);
    expect(scoreOnsets(sounds.map(s => s.startS), notes.map(n => n.startS)).fMeasure).toBeGreaterThanOrEqual(0.9);
  });
});

describe("no notes from silence or noise", () => {
  for (const profile of ["violin", "guitar", "piano", "tuner"] as const) {
    it(`${profile}: digital silence`, () => {
      expect(detectNotes(silence(2), { sampleRate: SR, profile })).toEqual([]);
    });
    it(`${profile}: room noise under and above the gate`, () => {
      for (const amplitude of [0.0003, 0.003, 0.03]) {
        const noise = whiteNoise({ durationS: 2, amplitude, seed: 21 });
        expect(detectNotes(noise, { sampleRate: SR, profile }), `amplitude ${amplitude}`).toEqual([]);
      }
    });
  }
});

describe("live latency (spec 4.4)", () => {
  /** Runs the causal path frame by frame and records when each event became available. */
  function liveEvents(signal: Float32Array, profile: AnalysisProfileId) {
    const analyser = new FrameAnalyser({ sampleRate: SR, profile });
    const tracker = new NoteTracker({ profile });
    const onsetsSeen: { at: number; onset: number }[] = [];
    const noteOns: { at: number; start: number; midi: number }[] = [];
    // Feed in 128-sample render quanta, as the AudioWorklet does.
    for (let i = 0; i < signal.length; i += 128) {
      for (const frame of analyser.push(signal.subarray(i, i + 128))) {
        for (const event of tracker.push(toTrackerFrame(frame))) {
          if (event.type === "note-on") noteOns.push({ at: frame.time, start: event.note.startS, midi: event.note.midi });
        }
        if (frame.onset !== null) onsetsSeen.push({ at: frame.time, onset: frame.onset });
      }
    }
    return { onsetsSeen, noteOns };
  }

  it("guitar: onset known <= 60 ms after the attack; pitch decided <= 120 ms after it", () => {
    const line = pluckSequence(GUITAR_LINE);
    const { onsetsSeen, noteOns } = liveEvents(addNoise(line.samples, 30), "guitar");
    expect(onsetsSeen).toHaveLength(line.onsets.length);
    onsetsSeen.forEach((o, i) => expect(o.at - line.onsets[i]!, `onset ${i}`).toBeLessThanOrEqual(0.06));
    expect(noteOns.map(n => n.midi)).toEqual(GUITAR_LINE);
    noteOns.forEach((n, i) => expect(n.at - line.onsets[i]!, `note ${i}`).toBeLessThanOrEqual(0.12));
  });

  it("violin: pitch decided <= 120 ms after the (soft) attack", () => {
    const line = bowedLine(VIOLIN_LINE.slice(0, 6));
    const { noteOns } = liveEvents(addNoise(line.samples, 30), "violin");
    expect(noteOns.map(n => n.midi)).toEqual(VIOLIN_LINE.slice(0, 6));
    noteOns.forEach((n, i) => expect(n.at - line.onsets[i]!, `note ${i}`).toBeLessThanOrEqual(0.12));
  });
});

describe("performance", () => {
  for (const profile of ["violin", "guitar", "piano", "tuner"] as const) {
    it(`${profile}: a frame is analysed well under its hop time`, () => {
      const { hopSize } = scaledSizes(ANALYSIS_PROFILES[profile], SR);
      const signal = addNoise(pluckSequence([45, 52, 57, 64]).samples, 30);
      const analyser = new FrameAnalyser({ sampleRate: SR, profile });
      const tracker = new NoteTracker({ profile, keepFrames: false });
      analyser.push(signal.subarray(0, SR / 2)); // warm up (JIT)
      const started = performance.now();
      const frames = analyser.push(signal.subarray(SR / 2));
      for (const frame of frames) tracker.push(toTrackerFrame(frame));
      const perFrameMs = (performance.now() - started) / frames.length;
      const hopMs = (hopSize / SR) * 1000;
      expect(perFrameMs).toBeLessThan(hopMs * 0.5);
    });
  }
});

describe("velocity", () => {
  it("maps peak level to 1-127", () => {
    expect(velocityFromLevel(-80)).toBe(1);
    expect(velocityFromLevel(0)).toBe(127);
    const mid = velocityFromLevel(-28);
    expect(mid).toBeGreaterThan(40);
    expect(mid).toBeLessThan(90);
  });
});
