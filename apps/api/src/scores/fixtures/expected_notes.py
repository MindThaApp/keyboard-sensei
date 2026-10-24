"""Writes <fixture>.expected.json for the ABC and **kern fixtures, read independently of Verovio.

Usage (music21 10.x, in a virtualenv outside the repo):
    python expected_notes.py abc-edge-cases.abc kern-chorale-satb.krn ...

Each JSON file holds every sounding note of the score as music21 reads it, ties merged
into the note that starts them: {"staff", "midi", "onsetQ", "durationQ"}. Staff 0 is the
top staff (parts are ranked by mean pitch, highest first); onsets are in quarter notes.
"""
import json
import statistics
import sys
from fractions import Fraction

from music21 import converter, note, chord, stream


def quarters(value):
    return float(Fraction(value).limit_denominator(1000))


def part_notes(part):
    flat = part.stripTies(inPlace=False).flatten()
    out = []
    for element in flat.notes:
        pitches = element.pitches if isinstance(element, chord.Chord) else [element.pitch]
        for pitch in pitches:
            out.append({"midi": pitch.midi, "onsetQ": quarters(element.offset), "durationQ": quarters(element.quarterLength)})
    return out


def read(path):
    parsed = converter.parse(path)
    # A multi-tune ABC file parses to an Opus of scores; the fixtures hold one tune.
    parts = list(parsed.parts) if parsed.hasPartLikeStreams() else [parsed]
    ranked = [(part, part_notes(part)) for part in parts]
    ranked = [(part, notes) for part, notes in ranked if notes]
    ranked.sort(key=lambda item: -statistics.mean(n["midi"] for n in item[1]))
    notes = [dict(staff=staff, **n) for staff, (_, group) in enumerate(ranked) for n in group]
    notes.sort(key=lambda n: (n["onsetQ"], n["staff"], n["midi"]))
    return notes


if __name__ == "__main__":
    for path in sys.argv[1:]:
        notes = read(path)
        with open(path + ".expected.json", "w") as handle:
            json.dump({"source": path, "reader": "music21 " + __import__("music21").__version__, "notes": notes}, handle, indent=1)
        print(path, len(notes), "notes,", len({n["staff"] for n in notes}), "staves")
