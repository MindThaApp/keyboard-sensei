/**
 * Shared shapes between the Piano check (phase 1, measurement only) and the
 * guided tuning aid (phase 2). The Piano check produces one
 * `PianoNoteMeasurement` per key it measures; the tuning aid only consumes that
 * shape, so either side can supply the analyser (`PianoNoteAnalyzer`).
 *
 * Frequencies are in Hz, deviations in cents. "Pitch" of a piano note always
 * means the frequency of its first partial (`f0 * sqrt(1 + B)`), which is what
 * a listener and a tuning device report.
 */

/** One measured partial of a piano tone. `n` is the partial number (1 = fundamental). */
export interface PartialPeak {
  n: number;
  freqHz: number;
  /** Linear magnitude, relative within one measurement only. */
  amplitude: number;
}

/** Result of measuring one sustained piano note (Piano check, spec 6.1 step 3). */
export interface PianoNoteMeasurement {
  /** MIDI note number of the key that was played (21 = A0 ... 108 = C8). */
  midi: number;
  /** Ideal-string fundamental from the fit `f_n = n * f0 * sqrt(1 + B n^2)`. */
  f0Hz: number;
  /** Inharmonicity coefficient B of this note. */
  inharmonicityB: number;
  /** Pitch of the note: frequency of partial 1. */
  pitchHz: number;
  /** Partials found, sorted by `n`. */
  partials: PartialPeak[];
  /** 0..1: how well the partial series fits the model and how many partials were found. */
  confidence: number;
}

export interface MeasureOptions {
  /** Reference pitch, default 440. */
  a4Hz?: number;
  /** Highest partial number to search for, default depends on register. */
  maxPartials?: number;
  /** How far from equal temperament the note may be, in cents. Default 120 (covers pianos far below pitch). */
  searchCents?: number;
}

/** Measures one note from mono samples. The Piano check supplies one; this package ships a reference one. */
export type PianoNoteAnalyzer = (
  samples: Float32Array,
  sampleRate: number,
  midi: number,
  options?: MeasureOptions,
) => PianoNoteMeasurement | null;

/** A measured inharmonicity sample, the input to the tuning curve. */
export interface InharmonicitySample {
  midi: number;
  inharmonicityB: number;
}
