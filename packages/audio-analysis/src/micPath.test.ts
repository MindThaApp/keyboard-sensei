import { describe, expect, it } from "vitest";
import { analyseBuffer } from "./analyser.js";
import { frequencyToMidi, rmsDb } from "./pitch.js";
import { detectNotes, NoteTracker, toTrackerFrame } from "./tracker.js";
import { decodeWav, encodeWav } from "./testing/wav.js";
import { renderMelody } from "./testing/synth.js";

const SR = 48000;

describe("pitch under the gate (quietPitchDb)", () => {
  // A4 at about -36 dBFS RMS against a -20 dB gate.
  const soft = renderMelody([{ midi: 69, startS: 0.1, durationS: 1, amplitude: 0.03 }]);

  it("is off by default: gated frames carry no pitch", () => {
    const frames = analyseBuffer(soft, { sampleRate: SR, profile: "violin", gateDb: -20 });
    expect(frames.every(f => f.gated)).toBe(true);
    expect(frames.every(f => f.frequency === null && f.candidates.length === 0)).toBe(true);
  });

  it("estimates pitch on gated frames within range, which stay gated", () => {
    const frames = analyseBuffer(soft, { sampleRate: SR, profile: "violin", gateDb: -20, quietPitchDb: 20 });
    const pitched = frames.filter(f => f.frequency !== null);
    expect(frames.every(f => f.gated)).toBe(true);
    expect(pitched.length).toBeGreaterThan(frames.length / 2);
    for (const f of pitched) expect(Math.round(frequencyToMidi(f.frequency!))).toBe(69);
    // 10 dB of range is not enough for a tone 16 dB under the gate.
    const narrow = analyseBuffer(soft, { sampleRate: SR, profile: "violin", gateDb: -20, quietPitchDb: 10 });
    expect(narrow.every(f => f.frequency === null)).toBe(true);
  });

  it("note tracking ignores it", () => {
    const frames = analyseBuffer(soft, { sampleRate: SR, profile: "violin", gateDb: -20, quietPitchDb: 20 });
    expect(frames.map(toTrackerFrame).every(f => f.candidates.length === 0 && f.voicedProbability === 0)).toBe(true);
    expect(detectNotes(soft, { sampleRate: SR, profile: "violin", gateDb: -20, quietPitchDb: 20 })).toEqual([]);
  });
});

describe("NoteTracker frame cap (maxFrames)", () => {
  const line = renderMelody(
    [
      { midi: 62, startS: 0.2, durationS: 0.4 },
      { midi: 66, startS: 0.7, durationS: 0.4 },
    ],
    { voice: "plucked" },
  );
  const frames = analyseBuffer(line, { sampleRate: SR, profile: "guitar" }).map(toTrackerFrame);

  it("keeps the offline pass under the cap", () => {
    const tracker = new NoteTracker({ profile: "guitar", maxFrames: frames.length });
    tracker.pushAll(frames);
    tracker.finish();
    expect(tracker.keepsFrames).toBe(true);
    expect(tracker.reanalyse().map(n => n.midi)).toEqual([62, 66]);
  });

  it("past the cap drops the frames, stays live and recovers on reset", () => {
    const tracker = new NoteTracker({ profile: "guitar", maxFrames: 50 });
    tracker.pushAll(frames);
    tracker.finish();
    expect(tracker.keepsFrames).toBe(false);
    expect(tracker.reanalyse()).toEqual(tracker.notes);
    expect(tracker.reanalyse().map(n => n.midi)).toEqual([62, 66]);
    tracker.reset();
    expect(tracker.keepsFrames).toBe(true);
    expect(tracker.reanalyse()).toEqual([]);
  });
});

describe("renderMelody", () => {
  for (const voice of ["bowed", "plucked", "piano"] as const) {
    it(`${voice}: the notes come back at their times, pitches and detune`, () => {
      const melody = [
        { midi: 60, startS: 0.2, durationS: 0.5 },
        { midi: 64, startS: 0.8, durationS: 0.5, cents: -15 },
        { midi: 67, startS: 1.4, durationS: 0.5 },
      ];
      const samples = renderMelody(melody, { voice, noiseDb: -70 });
      expect(samples.length).toBe(Math.round(2.2 * SR));
      const notes = detectNotes(samples, { sampleRate: SR, profile: voice === "bowed" ? "violin" : voice === "plucked" ? "guitar" : "piano" });
      expect(notes.map(n => n.midi)).toEqual([60, 64, 67]);
      notes.forEach((n, i) => expect(Math.abs(n.startS - melody[i]!.startS)).toBeLessThan(0.05));
      expect(notes[1]!.cents).toBeCloseTo(-15, -1);
    });
  }

  it("adds room noise at the given level", () => {
    const noise = renderMelody([], { durationS: 1, noiseDb: -40 });
    expect(rmsDb(noise)).toBeCloseTo(-40, 0);
    expect(renderMelody([], { durationS: 1 }).every(x => x === 0)).toBe(true);
  });

  it("follows A4", () => {
    const samples = renderMelody([{ midi: 69, startS: 0.1, durationS: 0.6 }], { a4: 442 });
    const [note] = detectNotes(samples, { sampleRate: SR, profile: "violin", a4: 442 });
    expect(note!.midi).toBe(69);
    expect(Math.abs(note!.cents)).toBeLessThan(2);
  });
});

describe("WAV encoding", () => {
  it("writes a 16-bit PCM mono RIFF header", () => {
    const bytes = encodeWav(new Float32Array(10), 44100);
    expect(bytes.length).toBe(44 + 20);
    const view = new DataView(bytes.buffer);
    expect(String.fromCharCode(...bytes.subarray(0, 4))).toBe("RIFF");
    expect(String.fromCharCode(...bytes.subarray(8, 16))).toBe("WAVEfmt ");
    expect(view.getUint32(4, true)).toBe(36 + 20);
    expect(view.getUint32(24, true)).toBe(44100);
    expect(view.getUint32(40, true)).toBe(20);
  });

  it("round-trips samples within one 16-bit step and clips beyond full scale", () => {
    const samples = Float32Array.from([0, 0.5, -0.5, 0.25, 1, -1, 1.7, -3]);
    const decoded = decodeWav(encodeWav(samples));
    expect(decoded.sampleRate).toBe(48000);
    const expected = [0, 0.5, -0.5, 0.25, 1, -1, 1, -1];
    decoded.samples.forEach((x, i) => expect(Math.abs(x - expected[i]!)).toBeLessThan(1 / 32767));
  });

  it("rejects what it did not write", () => {
    expect(() => decodeWav(new Uint8Array(44))).toThrow();
  });
});
