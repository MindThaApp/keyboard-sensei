import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ToneMidi from "@tonejs/midi";
import { describe, expect, it } from "vitest";
import { classifyMidiQuality } from "../midi-quality.js";
import { extractSongMetadata } from "../midi-metadata.js";
import { importScore } from "./import-score.js";
import { parseMusicXml } from "./musicxml-structure.js";
import { referenceNotes, type ReferenceNote } from "./reference-notes.js";
import { decodeScoreFile } from "./score-file.js";

const { Midi } = ToneMidi;

/**
 * Fixtures:
 * - foster-jeanie.mxl: Foster, "Jeanie with the Light Brown Hair", lead sheet with a
 *   repeat and 1st/2nd endings. "Public Domain" (music21 corpus, leadSheet/fosterBrownHair).
 * - johnson-lift-every-voice.mxl: J. R. Johnson, "Lift Every Voice and Sing", 6/8, four
 *   voices. "Public Domain (Encoding by MSAC: CC0)" (music21 corpus).
 * - liliuokalani-aloha-oe.mxl: Liliuokalani, "Aloha Oe", voices plus a two-staff piano.
 *   "Now, Public Domain; Encoding by MSAC, CC0" (music21 corpus).
 * - form-test.musicxml: written for these tests (see its header comment).
 */
const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const fixture = (name: string): Uint8Array => new Uint8Array(readFileSync(path.join(FIXTURES, name)));

const reference = (bytes: Uint8Array): ReferenceNote[] => referenceNotes(parseMusicXml(decodeScoreFile(bytes).text));

interface PlayedNote {
  track: number;
  midi: number;
  onsetQ: number;
  durationQ: number;
  timeS: number;
}

function playedNotes(bytes: Uint8Array): { notes: PlayedNote[]; midi: InstanceType<typeof Midi> } {
  const midi = new Midi(bytes);
  const ppq = midi.header.ppq;
  const notes = midi.tracks.flatMap((track, index) =>
    track.notes.map((note) => ({ track: index, midi: note.midi, onsetQ: note.ticks / ppq, durationQ: note.durationTicks / ppq, timeS: note.time })),
  );
  return { notes, midi };
}

/**
 * Pairs every reference note with a played one of the same pitch starting within a
 * tick, and returns what is left over on either side.
 */
function unmatched(expected: { midi: number; onsetQ: number }[], played: { midi: number; onsetQ: number }[], toleranceQ: number) {
  const pool = [...played];
  const missing: { midi: number; onsetQ: number }[] = [];
  for (const note of expected) {
    const index = pool.findIndex((candidate) => candidate.midi === note.midi && Math.abs(candidate.onsetQ - note.onsetQ) <= toleranceQ);
    if (index >= 0) pool.splice(index, 1);
    else missing.push(note);
  }
  return { missing, extra: pool };
}

describe("importScore", () => {
  it("plays repeats and 1st/2nd endings out, note for note (Foster, Jeanie)", async () => {
    const bytes = fixture("foster-jeanie.mxl");
    const result = await importScore(bytes);
    expect(result.kind).toBe("mxl");
    // 35 printed bars; the repeat goes back to bar 2 and the second time takes ending 2.
    expect(result.report.printedMeasures).toBe(35);
    expect(result.report.playedMeasures).toBe(65);
    expect(result.report.repeatsVerified).toBe(true);
    expect(result.report.warnings).toEqual([]);

    const expected = reference(bytes);
    const { notes } = playedNotes(result.midi);
    expect(notes).toHaveLength(180);
    expect(expected).toHaveLength(180);
    const tick = 1 / 120;
    expect(unmatched(expected, notes, tick)).toEqual({ missing: [], extra: [] });
    // Ties merged: every played note lasts as long as the notated (tied) value, less the release tick.
    for (const note of expected) {
      const match = notes.find((candidate) => candidate.midi === note.midi && Math.abs(candidate.onsetQ - note.onsetQ) <= tick)!;
      expect(Math.abs(match.durationQ - note.durationQ)).toBeLessThanOrEqual(tick + 1e-9);
    }
  });

  it("keeps 6/8 bars at three quarter notes (Johnson, Lift Every Voice)", async () => {
    const bytes = fixture("johnson-lift-every-voice.mxl");
    const result = await importScore(bytes);
    const { notes, midi } = playedNotes(result.midi);
    // The denominator survives (6/8, not 6/4), and the pickup and the short last bar get
    // time signatures of their real length, so the barlines fall where the score's do.
    expect(midi.header.timeSignatures.map((ts) => [ts.ticks / midi.header.ppq, ...ts.timeSignature])).toEqual([
      [0, 3, 8],
      [1.5, 6, 8],
      [91.5, 3, 8],
    ]);
    expect(result.report.printedMeasures).toBe(32);
    // Pickup bar plus 31 full bars of 3 quarter notes each: the last note ends at 93.
    const endQ = Math.max(...notes.map((note) => note.onsetQ + note.durationQ));
    expect(endQ).toBeCloseTo(93, 1);
    expect(unmatched(reference(bytes), notes, 1 / 120)).toEqual({ missing: [], extra: [] });
    expect(notes).toHaveLength(388);
    // No piano part: all four voices are played.
    expect(result.report.playedStaves).toEqual([0, 1, 2, 3]);
  });

  it("plays only the two-staff piano part, as right and left hand (Liliuokalani, Aloha Oe)", async () => {
    const bytes = fixture("liliuokalani-aloha-oe.mxl");
    const result = await importScore(bytes);
    expect(result.report.staffCount).toBe(7);
    expect(result.report.playedStaves).toEqual([5, 6]);
    expect(result.report.warnings).toContain("Only the piano part is played; the other parts are shown in the sheet music.");

    const { notes, midi } = playedNotes(result.midi);
    expect(midi.tracks.map((track) => track.name)).toEqual(["Right hand", "Left hand"]);
    // Every piano note, wherever it is engraved (a few cross staves, so compare by pitch and time).
    const piano = reference(bytes).filter((note) => note.staff === 5 || note.staff === 6);
    expect(piano).toHaveLength(265);
    expect(unmatched(piano, notes, 1 / 120)).toEqual({ missing: [], extra: [] });
    // The left hand is the lower track, so the play-along parser's lowest-track rule agrees.
    const mean = (track: number) => {
      const pitches = notes.filter((note) => note.track === track).map((note) => note.midi);
      return pitches.reduce((sum, pitch) => sum + pitch, 0) / pitches.length;
    };
    expect(mean(1)).toBeLessThan(mean(0));
  });

  it("repairs the repeats Verovio misreads, follows D.C. al Fine, and keeps meters and tempos (form test)", async () => {
    const bytes = fixture("form-test.musicxml");
    const result = await importScore(bytes);
    expect(result.kind).toBe("musicxml");
    // Forward repeats written in at bars 3 and 5, and the unbracketed last ending at bar 7.
    expect(result.report.repairedRepeats).toBe(3);
    expect(result.report.repeatsVerified).toBe(true);
    // 1 2 1 2 3 4 3 4 5 6 5 7 | D.C. 1 2 3 4 5 (Fine)
    expect(result.report.playedMeasures).toBe(17);
    expect(result.report.warnings).toEqual([]);

    const { notes, midi } = playedNotes(result.midi);
    const expected = reference(bytes);
    const graces = expected.filter((note) => note.grace);
    // The bar-3 grace note is played on each of the three passes through bar 3...
    expect(graces.map((note) => note.onsetQ)).toEqual([12, 18, 42]);
    expect(notes).toHaveLength(expected.length);
    // ...on the beat, delaying its main note by a fraction of a beat; everything else is exact.
    const { missing, extra } = unmatched(expected.filter((note) => !note.grace), notes, 1 / 8);
    expect(missing).toEqual([]);
    expect(extra.map((note) => [note.midi, note.onsetQ]).sort((a, b) => a[1] - b[1])).toEqual([
      [74, 12],
      [74, 18],
      [74, 42],
    ]);

    // 6/8 from bar 5 (first reached at 24 quarters), back to 3/4 for the D.C., 6/8 again
    // at bar 5. Verovio's own MIDI put one 6/8 at 21 and never went back to 3/4.
    expect(midi.header.timeSignatures.map((ts) => [ts.ticks / midi.header.ppq, ...ts.timeSignature])).toEqual([
      [0, 3, 4],
      [24, 6, 8],
      [36, 3, 4],
      [48, 6, 8],
    ]);
    // 90 qpm for the 24 quarters before bar 5 (16 s), then 120 qpm.
    const firstBar5 = notes.find((note) => note.midi === 69 && Math.abs(note.onsetQ - 24) < 1e-6)!;
    expect(firstBar5.timeS).toBeCloseTo(16, 3);
    // The D.C. returns to bar 1, so the tempo is 90 again there: a tempo map, not one BPM.
    expect(midi.header.tempos.map((tempo) => [tempo.ticks / midi.header.ppq, Math.round(tempo.bpm)])).toEqual([
      [0, 90],
      [24, 120],
      [36, 90],
      [48, 120],
    ]);
    const lastNote = notes.reduce((last, note) => (note.onsetQ > last.onsetQ ? note : last));
    // ...and the D.C. stops at Fine: the last note is bar 5's second dotted quarter.
    expect(lastNote.onsetQ).toBeCloseTo(49.5, 3);
  });

  it("produces a MIDI the existing upload pipeline accepts and the quality classifier rates", async () => {
    const result = await importScore(fixture("foster-jeanie.mxl"));
    const metadata = extractSongMetadata(result.midi);
    expect(metadata.noteCount).toBe(180);
    expect(metadata.durationSec).toBeGreaterThan(100);
    const quality = classifyMidiQuality(result.midi);
    // Score-derived timing is perfectly on the grid.
    expect(quality.signals?.quant).toBe(1);
    expect(quality.tier).not.toBe("low");
  });

  it("reads MEI too, including the MEI it writes itself", async () => {
    const first = await importScore(fixture("foster-jeanie.mxl"));
    const again = await importScore(new TextEncoder().encode(first.mei));
    expect(again.kind).toBe("mei");
    expect(again.report.repeatsVerified).toBeNull();
    expect(playedNotes(again.midi).notes).toHaveLength(180);
  });

  it("refuses what isn't a score", async () => {
    await expect(importScore(new TextEncoder().encode("<html><body>hi</body></html>"))).rejects.toThrow("This isn't a MusicXML, MEI, ABC or **kern score");
    await expect(importScore(new TextEncoder().encode("<score-partwise><part-list></score-partwise>"))).rejects.toThrow(/well-formed/);
    await expect(importScore(new Uint8Array([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6]))).rejects.toThrow();
  });
});
