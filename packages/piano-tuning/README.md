# @keyboard-sensei/piano-tuning

Pure TypeScript (no DOM) for the guided piano tuning aid, spec section 6.2.

| Module | What it does |
|---|---|
| `types.ts` | Shapes shared with the Piano check: `PianoNoteMeasurement`, `PianoNoteAnalyzer`, `InharmonicitySample` |
| `dsp.ts` | Pitch maths under this package's names, built on the Piano check's note range, equal temperament, cents and partial model |
| `measure.ts` | `measurePianoNote`: locates a note that may be far from pitch, then measures it with the Piano check's `measureNote` (zero-padded Hann FFT, partial peaks, fit of `f_n = n f0 sqrt(1 + B n^2)`); `measureLivePitch` for the per-note display, on the Piano check's spectrum and peak interpolation |
| `inharmonicity.ts` | B across the keyboard (log10 B, piecewise linear), fitted to measured samples with a weak pull to a typical piano |
| `curve.ts` | Stretch curve: A3-A4 temperament octave with a beatless 4:2, treble 4:2 widening to 2:1 at the top, bass 4:2 widening to 6:3; tuning order and sample keys |
| `checks.ts` | Beat detection for unison and octave checks; octave check from two measurements |
| `pitchRaise.ts` | Pitch level advice and capped overpull for the rough pass |
| `flow.ts` | The guided flow as a reducer: safety gate, measure, plan, tune (per-string steps), stop conditions, summary |
| `synth.ts` | Deterministic synthetic piano tones (known detune, B, unison detune, noise) for tests |

## Piano check integration

Phase 2 builds on phase 1's measurement core: `measurePianoNote` and
`measureLivePitch` use `@keyboard-sensei/piano-check` (spectrum, partial search,
f0/B fit), so both features measure a note the same way. The flow only consumes
`PianoNoteMeasurement`; the page accepts any analyser with the same signature
(`<PianoTuningAidPage analyzer={...} />`), and its measured notes seed the curve
(`RECORD_SAMPLE`).

## Safety

No action other than `ACKNOWLEDGE_SAFETY` changes a session until the safety
note (spec 6.3) is acknowledged, and the acknowledgement is never saved.
