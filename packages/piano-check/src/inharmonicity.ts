import { cents, etFrequency, DEFAULT_A4_HZ } from "./notes.js";
import { computeSpectrum, peakNear, type Peak, type Spectrum, type SpectrumOptions } from "./spectrum.js";

export interface Partial {
  n: number;
  freq: number;
  amp: number;
}

export interface NoteMeasurement {
  midi: number;
  /** Fitted fundamental of the ideal (harmonic) string, in Hz. */
  f0: number;
  /** Inharmonicity coefficient, or null when too few partials to fit one. */
  B: number | null;
  /** Value of B used to place f0 (fitted, or the typical-piano fallback). */
  bUsed: number;
  partials: Partial[];
  /** True when f0 came from a free fit of f0 and B (>= 4 partials spanning n >= 6, or >= 3 partials). */
  fitted: boolean;
  /** Strongest second peak next to a low partial, in cents away, or null. */
  splitCents: number | null;
  /** Peak-to-peak amplitude wobble (dB) of the low partials over the capture. */
  beatDb: number;
}

/** Typical B for a piano at a MIDI note; only a starting guess for the partial search. */
export function typicalB(midi: number): number {
  return 4e-5 * Math.exp(0.1 * (midi - 48)) + 2e-4 * Math.exp(-0.08 * (midi - 48));
}

/** Partial frequency for the string model f_n = n f0 sqrt(1 + B n^2). */
export function partialFrequency(f0: number, B: number, n: number): number {
  return n * f0 * Math.sqrt(1 + B * n * n);
}

interface Fit {
  f0: number;
  B: number;
}

/** Weighted least squares on (f_n/n)^2 = f0^2 (1 + B n^2). Needs >= 3 partials. */
export function fitF0B(ps: Partial[]): Fit | null {
  if (ps.length < 3) return null;
  let sw = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const p of ps) {
    const x = p.n * p.n;
    const y = (p.freq / p.n) ** 2;
    const w = x; // frequency error is ~constant in Hz, so weight by n^2
    sw += w; sx += w * x; sy += w * y; sxx += w * x * x; sxy += w * x * y;
  }
  const d = sw * sxx - sx * sx;
  if (Math.abs(d) < 1e-12) return null;
  const slope = (sw * sxy - sx * sy) / d;
  const intercept = (sy - slope * sx) / sw;
  if (intercept <= 0) return null;
  return { f0: Math.sqrt(intercept), B: Math.max(0, slope / intercept) };
}

/** f0 for a known B (amplitude-agnostic, n^2-weighted mean of the per-partial estimates). */
export function f0WithB(ps: Partial[], B: number): number {
  let sw = 0, s = 0;
  for (const p of ps) {
    const w = p.n * p.n;
    s += w * (p.freq / (p.n * Math.sqrt(1 + B * p.n * p.n)));
    sw += w;
  }
  return s / sw;
}

function findPartials(spec: Spectrum, f0Nominal: number): Partial[] {
  const nyq = spec.sampleRate / 2;
  const floor = Math.max(spec.noise * 8, 1e-9);
  const found: Partial[] = [];
  let est: Fit = { f0: f0Nominal, B: typicalB(Math.round(69 + 12 * Math.log2(f0Nominal / 440))) };
  let missed = 0;
  let strongest = 0;
  for (let n = 1; n <= 40; n++) {
    const pred = partialFrequency(est.f0, est.B, n);
    if (pred > nyq * 0.92) break;
    const widthCents = found.length < 3 ? 70 : 22;
    const fLo = pred * Math.pow(2, -widthCents / 1200);
    const fHi = pred * Math.pow(2, widthCents / 1200);
    const pk: Peak | null = peakNear(spec, fLo, fHi);
    const ok = pk && pk.amp > floor && pk.amp > strongest * 1e-3;
    if (!ok || !pk) {
      if (++missed >= 3 && found.length >= 2) break;
      continue;
    }
    missed = 0;
    strongest = Math.max(strongest, pk.amp);
    found.push({ n, freq: pk.freq, amp: pk.amp });
    const fit = fitF0B(found);
    if (fit && found.length >= 3) est = fit;
    else if (found.length >= 1) est = { f0: f0WithB(found, est.B), B: est.B };
  }
  return found;
}

/** Drop partials that sit far from the fitted series (spurious peaks), then refit. */
function robustFit(ps: Partial[]): { ps: Partial[]; fit: Fit | null } {
  let cur = ps;
  let fit = fitF0B(cur);
  for (let it = 0; it < 4 && fit && cur.length > 3; it++) {
    const res = cur.map((p) => Math.abs(cents(p.freq, partialFrequency(fit!.f0, fit!.B, p.n))));
    const worst = Math.max(...res);
    if (worst < 6) break;
    const drop = res.indexOf(worst);
    const next = cur.filter((_, i) => i !== drop);
    const nf = fitF0B(next);
    if (!nf) break;
    cur = next;
    fit = nf;
  }
  return { ps: cur, fit };
}

function splitHint(spec: Spectrum, ps: Partial[]): number | null {
  let best: number | null = null;
  let bestRatio = 0;
  for (const p of ps.filter((q) => q.n <= 6)) {
    const gap = spec.lobeHz * 1.6;
    const span = p.freq * (Math.pow(2, 40 / 1200) - 1);
    if (span <= gap) continue;
    for (const [lo, hi] of [
      [p.freq - span, p.freq - gap],
      [p.freq + gap, p.freq + span],
    ] as const) {
      const q = peakNear(spec, lo, hi);
      if (!q) continue;
      const ratio = q.amp / p.amp;
      // A genuine second string is a real peak, not Hann sidelobe skirt (< -31 dB).
      if (ratio > 0.25 && ratio > bestRatio && q.amp > Math.max(spec.noise * 8, 1e-9)) {
        bestRatio = ratio;
        best = Math.abs(cents(q.freq, p.freq));
      }
    }
  }
  return best;
}

/** Peak-to-peak wobble (dB) of the low partials' envelope after removing the decay trend. */
function beatWobble(x: ArrayLike<number>, sampleRate: number, ps: Partial[]): number {
  const frame = 8192;
  const hop = 2048;
  if (x.length < frame * 3) return 0;
  let worst = 0;
  for (const p of ps.filter((q) => q.n <= 3)) {
    const w = (2 * Math.PI * p.freq) / sampleRate;
    const ts: number[] = [];
    const db: number[] = [];
    for (let s = 0; s + frame <= x.length; s += hop) {
      let re = 0, im = 0;
      for (let i = 0; i < frame; i++) {
        const win = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (frame - 1));
        const v = x[s + i] * win;
        re += v * Math.cos(w * (s + i));
        im -= v * Math.sin(w * (s + i));
      }
      ts.push(s / sampleRate);
      db.push(20 * Math.log10(Math.hypot(re, im) + 1e-12));
    }
    const n = ts.length;
    const mt = ts.reduce((a, b) => a + b, 0) / n;
    const md = db.reduce((a, b) => a + b, 0) / n;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) { num += (ts[i] - mt) * (db[i] - md); den += (ts[i] - mt) ** 2; }
    const slope = den ? num / den : 0;
    const res = db.map((d, i) => d - (md + slope * (ts[i] - mt)));
    worst = Math.max(worst, Math.max(...res) - Math.min(...res));
  }
  return worst;
}

export interface MeasureOptions extends SpectrumOptions {
  a4?: number;
  /**
   * Where to start the partial search (ideal-string f0, Hz). Default: equal temperament
   * at `a4`. A caller that has already located a note far from pitch passes it here.
   */
  f0Hint?: number;
}

/** Measure one captured piano note: partials, fitted f0 and inharmonicity B, unison hints. */
export function measureNote(
  samples: ArrayLike<number>,
  sampleRate: number,
  midi: number,
  opts: MeasureOptions = {},
): NoteMeasurement | null {
  const nominal = opts.f0Hint ?? etFrequency(midi, opts.a4 ?? DEFAULT_A4_HZ);
  const spec = computeSpectrum(samples, sampleRate, opts);
  const raw = findPartials(spec, nominal);
  if (raw.length < 1) return null;
  const { ps, fit } = robustFit(raw);
  let f0: number;
  let B: number | null = null;
  let bUsed = typicalB(midi);
  let fitted = false;
  // Free fit only when the partials span enough of the series to pin down B.
  const span = ps.length ? ps[ps.length - 1].n - ps[0].n : 0;
  const nMax = ps.length ? ps[ps.length - 1].n : 0;
  // In the treble B is large, so fewer partials already pin it down.
  const constrained = span >= 5 || nMax * nMax * typicalB(midi) >= 0.05;
  if (fit && ps.length >= 4 && constrained) {
    f0 = fit.f0; B = fit.B; bUsed = fit.B; fitted = true;
  } else {
    f0 = f0WithB(ps, bUsed);
  }
  return {
    midi, f0, B, bUsed, partials: ps, fitted,
    splitCents: splitHint(spec, ps),
    beatDb: beatWobble(samples, sampleRate, ps),
  };
}

/** Re-place f0 using a B interpolated from neighbouring notes (for notes with too few partials). */
export function refitWithB(m: NoteMeasurement, B: number): NoteMeasurement {
  return { ...m, f0: f0WithB(m.partials, B), bUsed: B };
}
