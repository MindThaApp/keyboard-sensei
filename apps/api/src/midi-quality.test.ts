import ToneMidi from "@tonejs/midi";
import { describe, expect, it } from "vitest";
import { classifyMidiQuality, measureQuantization, type QualityContext } from "./midi-quality.js";

const { Midi } = ToneMidi;

const PPQ = 480;
const SIXTEENTH = PPQ / 4;

interface TrackSpec {
  name: string;
  pitches: number[];
  /** Onset spacing in ticks. */
  step: number;
  count: number;
  /** Deterministic pseudo-random jitter in ticks, to model a live performance. */
  jitter?: number;
}

/** Small linear congruential generator so fixtures are identical on every run. */
function lcg(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function buildMidi(tracks: TrackSpec[], options: { tempoEvents?: number; bpm?: number } = {}): Uint8Array {
  const midi = new Midi();
  midi.header.setTempo(options.bpm ?? 120);
  midi.header.timeSignatures.push({ ticks: 0, timeSignature: [4, 4] });
  for (let i = 1; i < (options.tempoEvents ?? 1); i++) {
    midi.header.tempos.push({ ticks: i * PPQ * 2, bpm: (options.bpm ?? 120) + (i % 7) });
  }
  midi.header.update();
  const random = lcg(7);
  for (const spec of tracks) {
    const track = midi.addTrack();
    track.name = spec.name;
    for (let i = 0; i < spec.count; i++) {
      const jitter = spec.jitter ? Math.round((random() - 0.5) * 2 * spec.jitter) : 0;
      track.addNote({
        midi: spec.pitches[i % spec.pitches.length]!,
        ticks: Math.max(0, i * spec.step + jitter),
        durationTicks: spec.step,
        velocity: 0.7,
      });
    }
  }
  return midi.toArray();
}

/** About 64 s at 120 bpm: right hand high, left hand low, 16th-grid, dense tempo map (piano-midi.de style). */
const pianoMidiDe = () =>
  buildMidi(
    [
      { name: "Piano right", pitches: [72, 74, 76, 77, 79], step: SIXTEENTH * 2, count: 300 },
      { name: "Piano left", pitches: [48, 52, 55, 52], step: SIXTEENTH * 4, count: 150 },
    ],
    { tempoEvents: 120 },
  );

/** Same shape but onsets smeared across the beat, as in a recorded performance. */
const performance = () =>
  buildMidi([
    { name: "Piano right", pitches: [72, 74, 76, 77, 79], step: SIXTEENTH * 2, count: 300, jitter: 55 },
    { name: "Piano left", pitches: [48, 52, 55, 52], step: SIXTEENTH * 4, count: 150, jitter: 55 },
  ]);

const singleTrack = () => buildMidi([{ name: "Piano", pitches: [60, 62, 64, 65, 67, 69, 71, 72], step: SIXTEENTH * 2, count: 300 }]);

/** A 25 s one-handed melody, like the authored beginner pack. */
const beginnerTune = () => buildMidi([{ name: "Melody", pitches: [60, 60, 67, 67, 69, 69, 67], step: PPQ, count: 50 }]);

const classify = (bytes: Uint8Array, context?: QualityContext) => classifyMidiQuality(bytes, context);

const fullyChecked: QualityContext = {
  curated: true,
  incipitCheck: "pass",
  fileLicence: "public-domain",
  workPublicDomain: true,
  metadata: "complete",
  reviewerApproved: true,
};

describe("measureQuantization", () => {
  it("counts onsets on the 16th and 8th-triplet grids and tolerates 1/48 beat", () => {
    const onsets = [0, SIXTEENTH, PPQ / 3, PPQ / 3 + 5, 7];
    // Tolerance is PPQ / 48 = 10 ticks, so +5 and +7 still count.
    expect(measureQuantization(onsets, PPQ)).toBe(1);
    expect(measureQuantization([50, 55, 61], PPQ)).toBeLessThan(0.7);
    expect(measureQuantization([], PPQ)).toBe(0);
  });
});

describe("classifyMidiQuality", () => {
  it("rates a quantised two-hand file with a dense tempo map as Good", () => {
    const result = classify(pianoMidiDe());
    expect(result.signals!.tempoEvents).toBeGreaterThan(100);
    expect(result.signals!.quant).toBeGreaterThanOrEqual(0.95);
    expect(result.signals!.handSplit).toBe(true);
    expect(result.tier).toBe("good");
  });

  it("rates a performance-timed file Low", () => {
    const result = classify(performance());
    expect(result.signals!.quant).toBeLessThan(0.6);
    expect(result.tier).toBe("low");
    expect(result.reasons).toContain("performance-timing");
  });

  it("rates a quantised single-track file Unrated", () => {
    const result = classify(singleTrack());
    expect(result.tier).toBe("unrated");
    expect(result.reasons).toContain("single-track");
  });

  it("treats a short one-hand authored tune as Good, but a short unknown file as Low", () => {
    const bytes = beginnerTune();
    expect(classify(bytes, { authored: true }).tier).toBe("good");
    const unknown = classify(bytes);
    expect(unknown.tier).toBe("low");
    expect(unknown.reasons).toContain("fragment");
  });

  it("reaches Verified only with every curated fact in place", () => {
    const bytes = pianoMidiDe();
    expect(classify(bytes, fullyChecked).tier).toBe("verified");
    expect(classify(bytes, fullyChecked).reasons).toEqual([]);

    const withoutIncipit = classify(bytes, { ...fullyChecked, incipitCheck: "none" });
    expect(withoutIncipit.tier).toBe("good");
    expect(withoutIncipit.reasons).toContain("incipit-not-checked");

    expect(classify(bytes, { ...fullyChecked, reviewerApproved: false }).tier).toBe("good");
    expect(classify(bytes, { ...fullyChecked, fileLicence: "cc-by-nc" }).tier).toBe("good");
    expect(classify(bytes, { ...fullyChecked, workPublicDomain: false }).tier).toBe("good");
  });

  it("lets an authored single-hand tune be Verified", () => {
    expect(classify(beginnerTune(), { ...fullyChecked, authored: true }).tier).toBe("verified");
  });

  it("applies the context-driven Low and Unrated rules", () => {
    const bytes = pianoMidiDe();
    expect(classify(bytes, { nonPiano: true }).tier).toBe("low");
    expect(classify(bytes, { duplicateOfVerified: true }).tier).toBe("low");
    expect(classify(bytes, { publicBuild: true }).tier).toBe("low");
    expect(classify(bytes, { publicBuild: true, fileLicence: "cc-by-sa" }).tier).toBe("good");
    expect(classify(bytes, { metadata: "incomplete" }).tier).toBe("unrated");
  });

  it("rates unparseable and empty files Low without throwing", () => {
    expect(classify(new Uint8Array([1, 2, 3, 4])).tier).toBe("low");
    expect(classify(new Uint8Array([1, 2, 3, 4])).reasons).toEqual(["unparseable"]);
    const empty = new Midi();
    empty.addTrack();
    expect(classify(empty.toArray()).reasons).toEqual(["no-notes"]);
  });

  it("is deterministic and orders scores within a tier", () => {
    const bytes = pianoMidiDe();
    expect(classify(bytes, fullyChecked)).toEqual(classify(bytes, fullyChecked));
    expect(classify(bytes, { metadata: "complete" }).score).toBeGreaterThan(classify(bytes).score);
    expect(classify(bytes).score).toBeLessThanOrEqual(100);
  });
});
