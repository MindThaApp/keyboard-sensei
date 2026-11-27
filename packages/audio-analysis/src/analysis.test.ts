import { describe, expect, it } from "vitest";
import { FrameAnalyser, MIC_PROFILES, NoteSegmenter, centsBetween, hzToMidi, midiToHz, rmsDb, synthesizeMelody, yin, type DetectedNote, type MicProfile } from "./index.js";

const SR = 48_000;

function analyse(samples: Float32Array, profile: MicProfile, gateDb = -45): DetectedNote[] {
  const segmenter = new NoteSegmenter({ gateDb });
  const analyser = new FrameAnalyser(profile, SR, 0, (frame) => segmenter.push(frame));
  for (let i = 0; i < samples.length; i += 128) analyser.push(samples.subarray(i, i + 128));
  segmenter.flush((samples.length / SR) * 1000);
  return [...segmenter.detected];
}

describe("pitch helpers", () => {
  it("converts between Hz, MIDI and cents", () => {
    expect(hzToMidi(440)).toBe(69);
    expect(midiToHz(60)).toBeCloseTo(261.626, 2);
    expect(hzToMidi(442, 442)).toBe(69);
    expect(centsBetween(880, 440)).toBeCloseTo(1200);
  });
  it("measures level", () => {
    expect(rmsDb(new Float32Array(256))).toBe(-120);
    const full = new Float32Array(256).fill(1);
    expect(rmsDb(full)).toBeCloseTo(0);
  });
});

describe("yin", () => {
  it("finds the fundamental of a harmonic tone within a cent", () => {
    for (const midi of [45, 57, 69, 76]) {
      const tone = synthesizeMelody([{ midi, startMs: 0, durationMs: 200 }], { totalMs: 200 });
      const { f0Hz, confidence } = yin(tone.subarray(2400, 2400 + 2048), SR, { minHz: 70, maxHz: 1400 });
      expect(Math.abs(centsBetween(f0Hz!, midiToHz(midi)))).toBeLessThan(1);
      expect(confidence).toBeGreaterThan(0.9);
    }
  });
  it("reports no pitch for noise", () => {
    const noise = synthesizeMelody([], { totalMs: 100, noiseDb: -20, seed: 7 });
    expect(yin(noise.subarray(0, 2048), SR, { minHz: 70, maxHz: 1400 }).f0Hz).toBeNull();
  });
});

describe("NoteSegmenter on synthetic melodies", () => {
  it("segments a detached violin-like line with the right notes, times and cents", () => {
    const melody = [
      { midi: 62, startMs: 100, durationMs: 400 },
      { midi: 64, startMs: 600, durationMs: 400, cents: -20 },
      { midi: 66, startMs: 1100, durationMs: 400, cents: 15 },
      { midi: 67, startMs: 1600, durationMs: 400 },
    ];
    const notes = analyse(synthesizeMelody(melody, { noiseDb: -60 }), MIC_PROFILES.violin);
    expect(notes.map((n) => n.midi)).toEqual([62, 64, 66, 67]);
    notes.forEach((note, i) => {
      expect(Math.abs(note.startMs - melody[i]!.startMs)).toBeLessThan(40);
      expect(Math.abs(note.centsOffset - (melody[i]!.cents ?? 0))).toBeLessThan(2);
    });
  });

  it("splits legato notes on a pitch change without a new attack", () => {
    const melody = [
      { midi: 69, startMs: 100, durationMs: 400 },
      { midi: 71, startMs: 500, durationMs: 400 },
    ];
    const notes = analyse(synthesizeMelody(melody, { attackMs: 1, releaseMs: 1 }), MIC_PROFILES.violin);
    expect(notes.map((n) => n.midi)).toEqual([69, 71]);
    expect(Math.abs(notes[1]!.startMs - 500)).toBeLessThan(60);
  });

  it("follows plucked low guitar notes", () => {
    const melody = [40, 45, 50, 55].map((midi, i) => ({ midi, startMs: 100 + i * 500, durationMs: 450 }));
    const notes = analyse(synthesizeMelody(melody, { decayMs: 400, harmonics: [1, 0.8, 0.5, 0.3, 0.2] }), MIC_PROFILES.guitar);
    expect(notes.map((n) => n.midi)).toEqual([40, 45, 50, 55]);
  });

  it("reports nothing for silence or noise under the gate", () => {
    expect(analyse(new Float32Array(SR), MIC_PROFILES.piano)).toEqual([]);
    expect(analyse(synthesizeMelody([], { totalMs: 1000, noiseDb: -55, seed: 3 }), MIC_PROFILES.piano)).toEqual([]);
  });

  it("drops blips shorter than 50 ms", () => {
    expect(analyse(synthesizeMelody([{ midi: 69, startMs: 100, durationMs: 30 }]), MIC_PROFILES.violin)).toEqual([]);
  });

  it("announces an onset early with the live pitch guess", () => {
    const onsets: { startMs: number; midi: number }[] = [];
    const segmenter = new NoteSegmenter({ gateDb: -45 }, { onOnset: (onset) => onsets.push(onset) });
    let announcedAtMs: number | null = null;
    const analyser = new FrameAnalyser(MIC_PROFILES.piano, SR, 0, (frame) => {
      segmenter.push(frame);
      if (onsets.length && announcedAtMs === null) announcedAtMs = frame.timeMs;
    });
    const samples = synthesizeMelody([{ midi: 60, startMs: 200, durationMs: 500 }]);
    for (let i = 0; i < samples.length; i += 128) analyser.push(samples.subarray(i, i + 128));
    expect(onsets).toHaveLength(1);
    expect(onsets[0]!.midi).toBe(60);
    // Spec 4.4: onset within ~60 ms of the attack on desktop.
    expect(announcedAtMs! - 200).toBeLessThan(80);
  });

  it("processes a frame well inside the hop time", () => {
    const samples = synthesizeMelody([{ midi: 57, startMs: 0, durationMs: 2000 }], { totalMs: 2000 });
    let frames = 0;
    const analyser = new FrameAnalyser(MIC_PROFILES.piano, SR, 0, () => frames++);
    const started = performance.now();
    analyser.push(samples);
    const perFrameMs = (performance.now() - started) / frames;
    // Hop of 256 samples is 5.3 ms of audio.
    expect(perFrameMs).toBeLessThan(5.3);
  });
});
