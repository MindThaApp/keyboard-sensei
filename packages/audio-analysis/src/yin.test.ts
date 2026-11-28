import { describe, expect, it } from "vitest";
import { ANALYSIS_PROFILES, scaledSizes, type AnalysisProfileId } from "./analyser.js";
import { median, midiToFrequency } from "./pitch.js";
import { preferExpectedOctave } from "./pyin.js";
import { centsError, grossPitchErrorRate } from "./testing/metrics.js";
import { addNoise, bowedTone, detune, harmonicTone, karplusStrong, pianoTone, sawtooth, sine, whiteNoise } from "./testing/synth.js";
import { YinDetector } from "./yin.js";

const SR = 48000;

function detectorFor(profile: AnalysisProfileId, sampleRate = SR): YinDetector {
  const p = ANALYSIS_PROFILES[profile];
  return new YinDetector({
    sampleRate,
    windowSize: scaledSizes(p, sampleRate).windowSize,
    minFrequency: p.minFrequency,
    maxFrequency: p.maxFrequency,
    threshold: p.yinThreshold,
  });
}

/** YIN estimates over a signal, one frame every `hop` samples, skipping the first 50 ms. */
function estimates(detector: YinDetector, signal: Float32Array, hop = 512): (number | null)[] {
  const out: (number | null)[] = [];
  for (let start = Math.round(0.05 * SR); start + detector.windowSize <= signal.length; start += hop) {
    out.push(detector.analyse(signal.subarray(start, start + detector.windowSize)).frequency);
  }
  return out;
}

/** Notes across each profile's range (MIDI). */
const RANGES: Record<Exclude<AnalysisProfileId, "tuner">, number[]> = {
  violin: [55, 62, 69, 76, 81, 88, 93, 100],
  guitar: [38, 40, 45, 50, 55, 59, 64, 69, 76, 84, 88],
  piano: [33, 40, 48, 57, 60, 67, 72, 84, 96],
};

type Generator = (frequency: number) => Float32Array;
const GENERATORS: Record<string, Generator> = {
  sine: f => sine({ frequency: f, durationS: 0.6 }),
  sawtooth: f => sawtooth({ frequency: f, durationS: 0.6 }),
  "karplus-strong": f => karplusStrong({ frequency: f, durationS: 0.6 }),
  bowed: f => bowedTone({ frequency: f, durationS: 0.6, attackS: 0.02 }),
};

describe("YIN on clean synthetic tones", () => {
  for (const profile of Object.keys(RANGES) as (keyof typeof RANGES)[]) {
    const detector = detectorFor(profile);
    for (const [name, generate] of Object.entries(GENERATORS)) {
      it(`${profile}: ${name} across the range, median error < 0.5 cents`, () => {
        for (const midi of RANGES[profile]) {
          // Karplus-Strong decays too fast to sustain above ~1.3 kHz; its tuning there is approximate.
          if (name === "karplus-strong" && midi > 88) continue;
          // Known detune: every note is 13 cents sharp.
          const truth = detune(midiToFrequency(midi), 13);
          const found = estimates(detector, generate(truth));
          expect(grossPitchErrorRate(found, truth), `${name} ${midi}`).toBe(0);
          const errors = found.map(f => Math.abs(centsError(f!, truth)));
          expect(median(errors), `${name} ${midi}`).toBeLessThan(0.5);
        }
      });
    }
  }

  // Stiff-string partials sit sharp of n·f0, which pulls the waveform period (and
  // the heard pitch) slightly sharp too. The Piano check measures partials instead.
  it("piano-like inharmonic tones: right note, within 10 cents", () => {
    const detector = detectorFor("piano");
    for (const midi of RANGES.piano) {
      const truth = midiToFrequency(midi);
      const found = estimates(detector, pianoTone({ frequency: truth, durationS: 0.6, inharmonicity: midi < 45 ? 0.0002 : 0.0004 }));
      expect(grossPitchErrorRate(found, truth), String(midi)).toBe(0);
      expect(Math.abs(median(found.map(f => centsError(f!, truth)))), String(midi)).toBeLessThan(10);
    }
  });

  it("works at 44.1 kHz too", () => {
    const detector = detectorFor("guitar", 44100);
    const truth = midiToFrequency(52);
    const signal = sawtooth({ frequency: truth, durationS: 0.6, sampleRate: 44100 });
    const found: (number | null)[] = [];
    for (let s = 2000; s + detector.windowSize <= signal.length; s += 997) found.push(detector.analyse(signal.subarray(s, s + detector.windowSize)).frequency);
    expect(median(found.map(f => Math.abs(centsError(f!, truth))))).toBeLessThan(0.5);
  });
});

describe("YIN with noise (SNR 30 / 20 / 10 dB)", () => {
  for (const snr of [30, 20, 10]) {
    for (const profile of ["violin", "guitar", "piano"] as const) {
      it(`${profile} at ${snr} dB: gross pitch error < 2% of voiced frames`, () => {
        const detector = detectorFor(profile);
        let bad = 0;
        let total = 0;
        const errors: number[] = [];
        RANGES[profile].forEach((midi, i) => {
          const truth = midiToFrequency(midi);
          for (const generate of [GENERATORS.sawtooth!, GENERATORS.bowed!]) {
            const found = estimates(detector, addNoise(generate(truth), snr, 100 + i));
            bad += grossPitchErrorRate(found, truth) * found.length;
            total += found.length;
            for (const f of found) if (f !== null) errors.push(Math.abs(centsError(f, truth)));
          }
        });
        expect(bad / total).toBeLessThan(0.02);
        // Sustained notes stay within the recorded-fixture target even in noise.
        expect(median(errors)).toBeLessThan(snr >= 20 ? 1 : 2);
      });
    }
  }
});

describe("octave errors", () => {
  const detector = detectorFor("guitar");

  it("strong 2nd harmonic, weak fundamental: reports the fundamental", () => {
    for (const midi of [40, 45, 50]) {
      const truth = midiToFrequency(midi);
      const found = estimates(detector, harmonicTone({ frequency: truth, durationS: 0.5, harmonics: [0.15, 1, 0.3, 0.5, 0.2] }));
      expect(grossPitchErrorRate(found, truth), String(midi)).toBeLessThan(0.02);
    }
  });

  it("missing fundamental: still the period of the whole tone", () => {
    const truth = midiToFrequency(45);
    const found = estimates(detector, harmonicTone({ frequency: truth, durationS: 0.5, harmonics: [0, 1, 0.8, 0.6, 0.4] }));
    expect(grossPitchErrorRate(found, truth)).toBeLessThan(0.02);
  });

  it("expected-note tie-break only moves octaves within the same pitch class", () => {
    const a3 = { frequency: 220, probability: 0.5, aperiodicity: 0.05 };
    const a2 = { frequency: 110, probability: 0.45, aperiodicity: 0.06 };
    const e3 = { frequency: 164.8, probability: 0.44, aperiodicity: 0.06 };
    // Expected A2: the similar-probability A2 wins over A3.
    expect(preferExpectedOctave([a3, a2, e3], 45)?.frequency).toBe(110);
    // Expected E3: a different pitch class never wins, however close.
    expect(preferExpectedOctave([a3, a2, e3], 52)?.frequency).toBe(220);
    // A much less likely octave does not win either.
    expect(preferExpectedOctave([a3, { ...a2, probability: 0.1 }], 45)?.frequency).toBe(220);
  });
});

describe("noise and silence", () => {
  it("white noise is unvoiced", () => {
    for (const profile of ["violin", "guitar", "piano", "tuner"] as const) {
      const detector = detectorFor(profile);
      const noise = whiteNoise({ durationS: 1, amplitude: 0.1, seed: 9 });
      let voiced = 0;
      let frames = 0;
      for (let s = 0; s + detector.windowSize <= noise.length; s += 1024) {
        const result = detector.analyse(noise.subarray(s, s + detector.windowSize));
        frames++;
        if (result.frequency !== null) voiced++;
        expect(result.voicedProbability, profile).toBeLessThan(0.2);
      }
      expect(voiced / frames, profile).toBeLessThan(0.05);
    }
  });

  it("silence is unvoiced", () => {
    const detector = detectorFor("guitar");
    const result = detector.analyse(new Float32Array(detector.windowSize));
    expect(result.frequency).toBeNull();
  });

  it("pYIN candidates: a clean tone is voiced with the true pitch on top", () => {
    const detector = detectorFor("violin");
    const truth = midiToFrequency(69);
    const result = detector.analyse(sawtooth({ frequency: truth, durationS: 0.1 }));
    expect(result.voicedProbability).toBeGreaterThan(0.9);
    expect(Math.abs(centsError(result.candidates[0]!.frequency, truth))).toBeLessThan(0.5);
  });
});

describe("tuner profile at the extremes", () => {
  const detector = detectorFor("tuner");
  it("A0 to C8 on clean tones within 0.5 cents", () => {
    for (const midi of [21, 28, 40, 69, 96, 108]) {
      const truth = midiToFrequency(midi);
      const found = estimates(detector, sawtooth({ frequency: truth, durationS: 0.6 }));
      expect(grossPitchErrorRate(found, truth), String(midi)).toBe(0);
      expect(median(found.map(f => Math.abs(centsError(f!, truth)))), String(midi)).toBeLessThan(0.5);
    }
  });
});
