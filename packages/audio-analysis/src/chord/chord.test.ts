import { describe, expect, it } from "vitest";
import { GUITAR_CHORDS, chordMidiNotes, parseChordSymbol } from "@keyboard-sensei/music-theory";
import { analyseStrums, detectStrumOnsets, recognizeChordFromSamples, renderStrums, seededRandom, verifyChord } from "./index.js";

const SR = 48000;
const OPEN = ["Em", "Am", "E", "A", "D", "G", "C", "Dm", "D7", "A7", "E7", "C7"] as const;

function fixture(symbol: string, seed: number, snrDb?: number, direction: "down" | "up" = "down", gap = 14) {
  const notes = chordMidiNotes(GUITAR_CHORDS[symbol]!);
  return renderStrums([{ notes, startSeconds: 0.2, stringGapMs: gap, direction }], 1.2, SR, seed, snrDb);
}

describe("chord recognition on synthetic open chords", () => {
  it("names every open chord from a clean strum (top-1 >= 90%)", () => {
    let right = 0;
    let total = 0;
    const misses: string[] = [];
    for (const symbol of OPEN) {
      for (const [seed, direction, gap] of [[1, "down", 12], [2, "up", 20], [3, "down", 28]] as const) {
        const audio = fixture(symbol, seed, undefined, direction, gap);
        const strums = analyseStrums(audio, SR);
        total++;
        if (strums.length === 1 && strums[0]!.label === symbol) right++;
        else misses.push(`${symbol}/${direction}/${gap}->${strums.map((s) => s.label).join(",")}`);
      }
    }
    expect(right / total, misses.join(" ")).toBeGreaterThanOrEqual(0.9);
  });

  it("still names them with 20 dB of background noise (>= 90%)", () => {
    let right = 0;
    let total = 0;
    for (const symbol of OPEN) {
      for (const seed of [11, 12]) {
        const strums = analyseStrums(fixture(symbol, seed, 20), SR);
        total++;
        if (strums.length === 1 && strums[0]!.label === symbol) right++;
      }
    }
    expect(right / total).toBeGreaterThanOrEqual(0.9);
  });

  it("grades a wrong chord wrong (C played for Am, and others)", () => {
    const pairs: [string, string][] = [["C", "Am"], ["Am", "C"], ["G", "Em"], ["D", "Dm"], ["E", "Em"], ["A", "D"], ["Em", "E"], ["G", "C"]];
    for (const [played, asked] of pairs) {
      const strums = analyseStrums(fixture(played, 5), SR);
      expect(strums).toHaveLength(1);
      expect(verifyChord(strums[0]!.recognition, asked).ok, `${played} for ${asked}`).toBe(false);
      expect(verifyChord(strums[0]!.recognition, played).ok, `${played} for ${played}`).toBe(true);
    }
  });

  it("accepts G7 (one weak top string) through the near-neighbour margin, but not an unrelated chord", () => {
    const strum = analyseStrums(fixture("G7", 8), SR)[0]!;
    expect(verifyChord(strum.recognition, "G7").ok).toBe(true);
    expect(verifyChord(strum.recognition, "Em").ok).toBe(false);
  });

  it("accepts a near neighbour within the margin (7th heard for the plain chord)", () => {
    const recognition = recognizeChordFromSamples(fixture("D7", 6).subarray(Math.round(0.28 * SR), Math.round(0.6 * SR)), SR);
    expect(verifyChord(recognition, "D7").ok).toBe(true);
  });

  it("finds no strum in silence or noise", () => {
    expect(analyseStrums(new Float32Array(SR), SR)).toHaveLength(0);
    const rand = seededRandom(9);
    const noise = Float32Array.from({ length: SR }, () => (rand() * 2 - 1) * 0.0015);
    expect(detectStrumOnsets(noise, SR)).toHaveLength(0);
  });

  it("finds several strums in time and reports their onsets", () => {
    const notesA = chordMidiNotes(GUITAR_CHORDS["Em"]!);
    const notesB = chordMidiNotes(GUITAR_CHORDS["Am"]!);
    const audio = renderStrums(
      [0.2, 1.2, 2.2, 3.2].map((startSeconds, i) => ({ notes: i % 2 ? notesB : notesA, startSeconds })),
      4.4, SR, 21,
    );
    const strums = analyseStrums(audio, SR);
    expect(strums.map((s) => s.label)).toEqual(["Em", "Am", "Em", "Am"]);
    strums.forEach((s, i) => expect(Math.abs(s.onsetMs - (200 + i * 1000))).toBeLessThan(40));
  });

  it("ignores single sustained strings (not a chord)", () => {
    const audio = renderStrums([{ notes: [57], startSeconds: 0.2 }], 1.2, SR, 4);
    const strums = analyseStrums(audio, SR);
    for (const s of strums) expect(s.confidence).toBeLessThan(0.99);
    expect(parseChordSymbol("A5")).not.toBeNull();
  });
});

describe("chord changes while the previous chord still rings", () => {
  it("names >= 90% of strums across progressions", () => {
    const progressions = [["G", "C", "D", "G"], ["Em", "Am", "D", "G"], ["A", "D", "E", "A"], ["Am", "G", "C", "E"], ["C", "Am", "Dm", "G"]];
    let right = 0;
    let total = 0;
    const misses: string[] = [];
    progressions.forEach((chords, p) => {
      const audio = renderStrums(chords.map((c, i) => ({ notes: chordMidiNotes(GUITAR_CHORDS[c]!), startSeconds: 0.2 + i * 1.0, direction: i % 2 ? "up" as const : "down" as const })), 4.4, SR, 30 + p);
      const heard = analyseStrums(audio, SR).map((s) => s.label);
      chords.forEach((c, i) => { total++; if (heard[i] === c) right++; else misses.push(`${c}->${heard[i]}`); });
    });
    expect(right / total, misses.join(" ")).toBeGreaterThanOrEqual(0.9);
  });
});

describe("performance", () => {
  it("analyses a 4 s take well under real time", () => {
    const audio = renderStrums([{ notes: chordMidiNotes(GUITAR_CHORDS["G"]!), startSeconds: 0.3 }], 4, SR, 3);
    const t = performance.now();
    analyseStrums(audio, SR);
    expect(performance.now() - t).toBeLessThan(1500);
  });
});
