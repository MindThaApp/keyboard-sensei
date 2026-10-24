# Score-import fixtures

## ABC and Humdrum **kern (written for this project)

These files are **CC0 1.0** (public domain dedication). Each was transcribed or composed
for this repository; the tunes they are based on (Beethoven's "Ode to Joy") are in the public
domain, and the other pieces are original short studies, so nothing here is copied from any
corpus or collection.

| File | What it is | Exercises |
| --- | --- | --- |
| `abc-ode-to-joy-melody.abc` | "Ode to Joy", melody, one voice, D major | plain ABC, dotted/broken rhythm, one staff (hands: none) |
| `abc-edge-cases.abc` | original study, one voice | pickup bar, tie across a barline, triplet, chords (`[GBd]4`, length after the bracket), inline key change (G to D), meter change (4/4 to 3/4), a natural carried through the bar |
| `abc-ode-to-joy-two-voices.abc` | "Ode to Joy" as a two-hand setting (`V:RH`, `V:LH`) | refused: Verovio's ABC reader takes one voice |
| `abc-two-tunes.abc` | two tunes (`X:1`, `X:2`) | refused: one tune per file |
| `kern-ode-to-joy-piano.krn` | "Ode to Joy" two-hand setting, 2 spines (bass, treble) | two staves (right and left hand), key signature (F# and C#), chords, dotted rhythm |
| `kern-edge-cases.krn` | original study, 2 spines | pickup bar, ties across barlines (also a dotted-half tie), triplet, chords, key change (C to G) and meter change (4/4 to 3/4) |
| `kern-chorale-satb.krn` | original four-part chorale phrase, 4 spines | four staves, a tie, a chord in one voice |
| `kern-two-movements.krn` | two movements in one file | refused: one movement per file |

## Expected notes: `*.expected.json`

`expected_notes.py` reads each fixture with **music21** (10.5.1) and writes the notes it
finds: `{staff, midi, onsetQ, durationQ}`, ties merged into the note that starts them,
onsets in quarter notes, staff 0 = the highest part. This is a reader independent of
Verovio, which the import uses; the tests compare Verovio's MIDI against these files.
Regenerate with a virtualenv outside the repo:

    python -m venv ~/venvs/music21 && ~/venvs/music21/bin/pip install music21==10.5.1
    cd apps/api/src/scores/fixtures
    ~/venvs/music21/bin/python -I expected_notes.py abc-edge-cases.abc abc-ode-to-joy-melody.abc \
      kern-ode-to-joy-piano.krn kern-edge-cases.krn kern-chorale-satb.krn

## MusicXML / MEI fixtures

See the header of `../import-score.test.ts` for the licences of the `.mxl` files
(music21 corpus, public domain / CC0) and `form-test.musicxml`.
