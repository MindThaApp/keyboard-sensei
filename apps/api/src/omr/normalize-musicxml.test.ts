import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { importScore } from "../scores/import-score.js";
import { normalizeRecognisedMusicXml } from "./normalize-musicxml.js";

// homr's own output (services/omr, homr b549203) for two public-domain Mutopia editions:
// J. S. Bach, WTK I Prelude in C (Mutopia-2011/09/12-5) and Minuet in A minor, BWV Anh. 120
// (Mutopia-2009/01/06-1612), both placed in the public domain by their typesetters.
const fixture = (name: string) => readFileSync(join(import.meta.dirname, "fixtures", name), "utf8");
const PRELUDE = fixture("bach-wtk1-prelude1.homr.musicxml");
const MINUET = fixture("bach-minuet-bwv-anh120.homr.musicxml");
const bytes = (text: string) => new TextEncoder().encode(text);

/** Each note's (staff, voice, onset in divisions, pitch) per measure, in a canonical order. */
function noteOnsets(text: string): string[][] {
  const measures = text.split(/<measure\b/).slice(1);
  return measures.map((measure) => {
    let cursor = 0;
    let lastOnset = 0;
    const out: string[] = [];
    for (const [, tag, body] of measure.matchAll(/<(note|backup|forward)\b[^>]*>([\s\S]*?)<\/\1>/g)) {
      const duration = Number(/<duration>(\d+)<\/duration>/.exec(body!)?.[1] ?? 0);
      if (tag === "backup") cursor -= duration;
      else if (tag === "forward") cursor += duration;
      else {
        const chord = body!.includes("<chord");
        const onset = chord ? lastOnset : cursor;
        const pitch = /<step>(\w)<\/step>(?:<octave>(\d)<\/octave>)?(?:<alter>(-?\d)<\/alter>)?/.exec(body!)?.slice(1).join("") ?? "rest";
        out.push(`${/<staff>(\d+)/.exec(body!)?.[1]}/${/<voice>(\d+)/.exec(body!)?.[1]}@${onset}:${pitch}`);
        lastOnset = onset;
        if (!chord && !body!.includes("<grace")) cursor += duration;
      }
    }
    return out.sort();
  });
}

describe("normalizeRecognisedMusicXml", () => {
  it("keeps every note at its onset while making each voice contiguous", () => {
    const { text, reorderedMeasures } = normalizeRecognisedMusicXml(PRELUDE);
    expect(reorderedMeasures).toBe(35);
    expect(noteOnsets(text)).toEqual(noteOnsets(PRELUDE));
    // Within a measure, a voice's notes are no longer split up by other voices.
    const measure = text.split(/<measure\b/)[2]!;
    const voices = [...measure.matchAll(/<note>[\s\S]*?<voice>(\d+)<\/voice>/g)].map((match) => match[1]);
    expect(voices.filter((voice, index) => voice !== voices[index - 1])).toEqual(["1", "5", "6"]);
  });

  it("stops Verovio from reading the bars as overfull", async () => {
    const raw = await importScore(bytes(PRELUDE));
    const fixed = await importScore(bytes(normalizeRecognisedMusicXml(PRELUDE).text));
    expect(raw.report.overfullMeasures).toBe(31);
    expect(fixed.report.overfullMeasures).toBe(0);
    expect(fixed.report.printedMeasures).toBe(35);
  });

  it("moves a forward repeat written on the right of its bar to the left, so the repeats play as printed", async () => {
    const { text, movedRepeats } = normalizeRecognisedMusicXml(MINUET);
    expect(movedRepeats).toBe(1);
    const imported = await importScore(bytes(text));
    // 12 bars + pickup, repeated; 18 bars, repeated.
    expect(imported.report.repeatsVerified).toBe(true);
    expect(imported.report.playedMeasures).toBe(60);
    expect((await importScore(bytes(MINUET))).report.repeatsVerified).toBe(false);
  });
});
