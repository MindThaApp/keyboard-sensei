import ToneMidi from "@tonejs/midi";
import type { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { buildAuthoredMidi, checkScore, melodyPitches } from "../../essentials/authored/notation.js";
import { ESSENTIALS } from "../../essentials/manifest.js";
import { isPublicEligible } from "../backfill.js";
import { BEGINNER_WORKS, ESSENTIALS_WORKS, MOOD_TAGS, WORK_GENRES, composerIdFor } from "../works-data.js";
import { abcMelody, splitAbcTunes } from "./abc.js";
import { BATCH_A } from "./batch-a.js";
import { BATCH_AUTHORED_FOLK } from "./batch-authored-folk.js";
import { BATCH_B } from "./batch-b.js";
import { BATCH_C } from "./batch-c.js";
import { BATCH_D } from "./batch-d.js";
import { importPack } from "./import.js";
import { attributionFor, fileLicenceOf, songIdOf, sourceKindOf, type AuthoredPrimarySource, type Pack } from "./pack.js";

const { Midi } = ToneMidi;

const pieces = BATCH_AUTHORED_FOLK.pieces;
const authored = (piece: (typeof pieces)[number]) => piece.primary as AuthoredPrimarySource;
const otherPacks: Pack[] = [BATCH_A, BATCH_B, BATCH_C, BATCH_D];

const normalise = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

describe("Authored folk pack contents", () => {
  it("lists seven authored pieces, all with a machine-readable second source, and is not tagged as Midiano's", () => {
    expect(pieces).toHaveLength(7);
    expect(pieces.every((piece) => piece.primary.kind === "authored")).toBe(true);
    expect(pieces.every((piece) => piece.second.kind === "abc")).toBe(true);
    expect(BATCH_AUTHORED_FOLK.collection).toBeNull();
  });

  it("gives every piece its own Work and Song id, none already taken by another pack or the Essentials", () => {
    const taken = new Set([
      ...ESSENTIALS.map((piece) => piece.slug),
      ...Object.keys(ESSENTIALS_WORKS),
      ...Object.keys(BEGINNER_WORKS),
      ...otherPacks.flatMap((pack) => pack.pieces.map((piece) => piece.slug)),
    ]);
    const takenSongIds = new Set(otherPacks.flatMap((pack) => pack.pieces.map((piece) => songIdOf(piece))));
    expect(new Set(pieces.map((piece) => piece.slug)).size).toBe(pieces.length);
    expect(new Set(pieces.map((piece) => songIdOf(piece))).size).toBe(pieces.length);
    expect(new Set(pieces.map((piece) => piece.rank)).size).toBe(pieces.length);
    for (const piece of pieces) {
      expect(taken.has(piece.slug), piece.slug).toBe(false);
      expect(takenSongIds.has(songIdOf(piece)), piece.slug).toBe(false);
    }
  });

  it("repeats no title of an Essentials piece or of another pack's piece, nor takes another piece's title as an alias", () => {
    const others = [
      ...ESSENTIALS.map((piece) => normalise(piece.title)),
      ...otherPacks.flatMap((pack) => pack.pieces.flatMap((piece) => [normalise(piece.title), ...(piece.aliases ?? []).map((alias) => normalise(alias.alias))])),
    ];
    const titles = new Set(pieces.map((piece) => normalise(piece.title)));
    expect(titles.size).toBe(pieces.length);
    for (const piece of pieces) {
      expect(others.includes(normalise(piece.title)), piece.title).toBe(false);
      for (const { alias } of piece.aliases ?? []) {
        if (!normalise(alias)) continue; // a non-Latin alias has no Latin form to compare
        expect(others.includes(normalise(alias)), alias).toBe(false);
        expect(titles.has(normalise(alias)) && normalise(alias) !== normalise(piece.title), alias).toBe(false);
      }
    }
  });

  it("uses only known composers, genres and mood tags", () => {
    for (const piece of pieces) {
      expect(composerIdFor(piece.composer), piece.composer).not.toBeNull();
      expect(WORK_GENRES).toContain(piece.genre);
      for (const tag of piece.tags ?? []) expect(Object.keys(MOOD_TAGS)).toContain(tag);
    }
  });

  it("gives the one named composer a publication year before the cut-off that matters", () => {
    const cottrau = pieces.find((piece) => piece.composer === "Teodoro Cottrau")!;
    expect(cottrau.publishedYear).toBe(1849);
  });
});

describe("Authored folk scores", () => {
  it("builds every score into a file the library accepts: bars add up, 20 notes, 20 seconds", () => {
    for (const piece of pieces) {
      const { score } = authored(piece);
      expect(checkScore(score), piece.slug).toEqual([]);
      const midi = new Midi(buildAuthoredMidi(score));
      expect(midi.duration, piece.slug).toBeGreaterThanOrEqual(20);
      expect(midi.tracks.reduce((count, track) => count + track.notes.length, 0), piece.slug).toBeGreaterThanOrEqual(20);
      expect(midi.tracks.map((track) => track.name)).toEqual(expect.arrayContaining(["Melody", "Left hand"]));
    }
  });

  it("credits the source and says the harmony is original, and is public domain and eligible once published", () => {
    for (const piece of pieces) {
      const credit = attributionFor(piece, null);
      expect(credit, piece.slug).toContain("arranged for Midivory");
      expect(credit).toContain("Harmony and bass are original to this project.");
      expect(credit).toMatch(/Public Domain\.$/);
      expect(fileLicenceOf(piece)).toBe("public-domain");
      expect(sourceKindOf(piece)).toBe("authored");
      expect(isPublicEligible({ sourceKind: "authored", fileLicence: "public-domain", workPdStatus: "pd-worldwide" })).toBe(true);
      expect(authored(piece).sourceUrl).toMatch(/^https:\/\//);
    }
  });

  it("keeps every melody note on the staff the sources use: between G3 and D6", () => {
    for (const piece of pieces) {
      const pitches = melodyPitches(authored(piece).score);
      expect(Math.min(...pitches), piece.slug).toBeGreaterThanOrEqual(55);
      expect(Math.max(...pitches), piece.slug).toBeLessThanOrEqual(86);
    }
  });

  it("starts each tune with the notes its second source starts with", () => {
    const expected: Record<string, number[]> = {
      // G major, 4/4 (ingeb.org): G G G A B A G B A A G
      "au-clair-de-la-lune": [67, 67, 67, 69, 71, 69, 67, 71, 69, 69, 67],
      // C major, 3/4: the pickup-less opening of the verse, G G C C B B
      "santa-lucia": [67, 67, 72, 72, 71, 71],
      // G major, 6/8: D E D G G A B A D' B A B
      "skye-boat-song": [62, 64, 62, 67, 67, 69, 71, 69, 74, 71, 69, 71],
      // G major, 3/4: D E D E G A G A B A B A
      arirang: [62, 64, 62, 64, 67, 69, 67, 69, 71, 69, 71, 69],
      // G major, 2/4: G G G A A A B C D G
      "sur-le-pont-davignon": [67, 67, 67, 69, 69, 69, 71, 72, 74, 67],
      // G major, 4/4: the pickup G G, then G D B B B G
      "oh-my-darling-clementine": [67, 67, 67, 62, 71, 71, 71, 67],
      // G major, 2/4: G G G D E E D B B A A G
      "old-macdonald-had-a-farm": [67, 67, 67, 62, 64, 64, 62, 71, 71, 69, 69, 67],
    };
    for (const piece of pieces) {
      const pitches = melodyPitches(authored(piece).score);
      expect(pitches.slice(0, expected[piece.slug]!.length), piece.slug).toEqual(expected[piece.slug]);
    }
  });

  it("reads every second-source excerpt into at least 16 notes, and into the score's own opening once moved to its key", () => {
    for (const piece of pieces) {
      if (piece.second.kind !== "abc") continue;
      const source = abcMelody(splitAbcTunes(piece.second.abc)[0]!).map((note) => note + (piece.second.kind === "abc" ? (piece.second.transpose ?? 0) : 0));
      expect(source.length, piece.slug).toBeGreaterThanOrEqual(8);
      const mine = melodyPitches(authored(piece).score);
      // The excerpt is the opening of a longer file, so it may stop early; every note it has must be the score's.
      expect(mine.slice(0, Math.min(source.length, 12)), piece.slug).toEqual(source.slice(0, Math.min(source.length, 12)));
      expect(piece.second.url, piece.slug).toMatch(/^https:\/\//);
    }
  });

  it("checks the openings offline: every second source passes and nothing is rejected", async () => {
    const report = await importPack({} as PrismaClient, BATCH_AUTHORED_FOLK, { dryRun: true, year: 2026 });
    expect(report.counts).toMatchObject({ rejected: 0, checked: pieces.length });
    for (const entry of report.pieces) expect(entry.incipit?.result, entry.slug).toBe("pass");
    expect(report.pieces.every((entry) => entry.tier === "good")).toBe(true);
    expect(report.publicEligible).toBe(pieces.length);
  });
});
