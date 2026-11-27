# @keyboard-sensei/piano-tuning

Pure TypeScript (no DOM) for the guided piano tuning aid, spec section 6.2.

| Module | What it does |
|---|---|
| `types.ts` | Shapes shared with the Piano check: `PianoNoteMeasurement`, `PianoNoteAnalyzer`, `InharmonicitySample` |
| `measure.ts` | Reference analyser `measurePianoNote` (zero-padded Hann FFT, partial peaks, fit of `f_n = n f0 sqrt(1 + B n^2)`) and `measureLivePitch` for the per-note display |
| `inharmonicity.ts` | B across the keyboard (log10 B, piecewise linear), fitted to measured samples with a weak pull to a typical piano |
| `curve.ts` | Stretch curve: A3-A4 temperament octave with a beatless 4:2, treble 4:2 widening to 2:1 at the top, bass 4:2 widening to 6:3; tuning order and sample keys |
| `checks.ts` | Beat detection for unison and octave checks; octave check from two measurements |
| `pitchRaise.ts` | Pitch level advice and capped overpull for the rough pass |
| `flow.ts` | The guided flow as a reducer: safety gate, measure, plan, tune (per-string steps), stop conditions, summary |
| `synth.ts` | Deterministic synthetic piano tones (known detune, B, unison detune, noise) for tests |

## Piano check integration

The flow only consumes `PianoNoteMeasurement`. When the Piano check analyser is
available, pass it to the page (`<PianoTuningAidPage analyzer={...} />`) and its
measured notes can seed the curve (`RECORD_SAMPLE`). `measurePianoNote` is the
fallback with the same signature.

## Safety

No action other than `ACKNOWLEDGE_SAFETY` changes a session until the safety
note (spec 6.3) is acknowledged, and the acknowledgement is never saved.
