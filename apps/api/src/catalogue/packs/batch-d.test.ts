import ToneMidi from "@tonejs/midi";
import type { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { buildAuthoredMidi, checkScore } from "../../essentials/authored/notation.js";
import { ESSENTIALS } from "../../essentials/manifest.js";
import { isPublicEligible } from "../backfill.js";
import { BEGINNER_WORKS, ESSENTIALS_WORKS, MOOD_TAGS, WORK_GENRES, composerIdFor } from "../works-data.js";
import { abcMelody, splitAbcTunes } from "./abc.js";
import { BATCH_A } from "./batch-a.js";
import { BATCH_B } from "./batch-b.js";
import { BATCH_C } from "./batch-c.js";
import { BATCH_D } from "./batch-d.js";
import { importPack } from "./import.js";
import { attributionFor, fileLicenceOf, isAuthoredPrimary, songIdOf, sourceKindOf, type AuthoredPrimarySource, type MutopiaPrimarySource, type Pack } from "./pack.js";

const { Midi } = ToneMidi;

const pieces = BATCH_D.pieces;
const authored = pieces.filter((piece) => isAuthoredPrimary(piece.primary));
const mutopia = pieces.filter((piece) => piece.primary.kind === "mutopia");

const normalise = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

describe("Batch D contents", () => {
  it("lists 26 works from the 47 proposal rows, 17 of them authored scores and 9 Mutopia hymns", () => {
    // 47 rows = 26 works + 19 rows not imported (no verifiable source) + Love Divine (19.2 s, under the 20 s minimum)
    // + Baa, Baa, Black Sheep (an alias of Twinkle, Twinkle, Little Star) + 0 left over: 26 + 19 + 1 + 1 = 47.
    expect(pieces).toHaveLength(26);
    expect(authored).toHaveLength(17);
    expect(mutopia).toHaveLength(9);
    expect(new Set(pieces.map((piece) => piece.rank)).size).toBe(26);
    for (const piece of pieces) expect(piece.rank).toBeGreaterThanOrEqual(1);
    for (const piece of pieces) expect(piece.rank).toBeLessThanOrEqual(47);
  });

  it("is not tagged as Midiano's", () => {
    expect(BATCH_D.collection).toBeNull();
  });

  it("gives every piece its own Work and Song id, none already taken by another pack or the Essentials", () => {
    const taken = new Set([
      ...ESSENTIALS.map((piece) => piece.slug),
      ...Object.keys(ESSENTIALS_WORKS),
      ...Object.keys(BEGINNER_WORKS),
      ...[BATCH_A, BATCH_B, BATCH_C].flatMap((pack: Pack) => pack.pieces.map((piece) => piece.slug)),
    ]);
    const takenSongIds = new Set([BATCH_A, BATCH_B, BATCH_C].flatMap((pack: Pack) => pack.pieces.map((piece) => songIdOf(piece))));
    expect(new Set(pieces.map((piece) => piece.slug)).size).toBe(pieces.length);
    expect(new Set(pieces.map((piece) => songIdOf(piece))).size).toBe(pieces.length);
    for (const piece of pieces) {
      expect(taken.has(piece.slug), piece.slug).toBe(false);
      expect(takenSongIds.has(songIdOf(piece)), piece.slug).toBe(false);
    }
  });

  it("merge check: no piece repeats the title of an Essentials piece or of another pack's piece by the same composer", () => {
    const others = [
      ...ESSENTIALS.map((piece) => ({ key: normalise(piece.title), composer: normalise(piece.composer) })),
      ...[BATCH_A, BATCH_B, BATCH_C].flatMap((pack: Pack) => pack.pieces.map((piece) => ({ key: normalise(piece.title), composer: normalise(piece.composer) }))),
    ];
    const keys = new Set<string>();
    for (const piece of pieces) {
      const key = normalise(piece.title);
      expect(keys.has(key), piece.title).toBe(false);
      keys.add(key);
      expect(others.some((other) => other.key === key && other.composer === normalise(piece.composer)), piece.title).toBe(false);
    }
    // No alias of one piece is the title of another (the Jupiter tune is an alias of Thaxted only).
    const titles = new Set(pieces.map((piece) => normalise(piece.title)));
    for (const piece of pieces) for (const { alias } of piece.aliases ?? []) expect(titles.has(normalise(alias)) && normalise(alias) !== normalise(piece.title), alias).toBe(false);
  });

  it("uses only known composers, genres and mood tags", () => {
    for (const piece of pieces) {
      expect(composerIdFor(piece.composer), piece.composer).not.toBeNull();
      expect(WORK_GENRES).toContain(piece.genre);
      for (const tag of piece.tags ?? []) expect(Object.keys(MOOD_TAGS)).toContain(tag);
    }
  });

  it("gives the two composers who died after 1925 the publication year their public-domain status needs", () => {
    const holst = pieces.find((piece) => piece.composer === "Gustav Holst")!;
    const hughes = pieces.find((piece) => piece.composer === "John Hughes")!;
    expect(holst.publishedYear).toBeLessThan(1931);
    expect(hughes.publishedYear).toBeLessThan(1931);
  });
});

describe("Batch D authored scores", () => {
  it("builds every score into a file the library accepts: bars add up, 20 notes, 20 seconds", () => {
    for (const piece of authored) {
      const { score } = piece.primary as AuthoredPrimarySource;
      expect(checkScore(score), piece.slug).toEqual([]);
      const midi = new Midi(buildAuthoredMidi(score));
      expect(midi.duration, piece.slug).toBeGreaterThanOrEqual(20);
      expect(midi.tracks.reduce((count, track) => count + track.notes.length, 0), piece.slug).toBeGreaterThanOrEqual(20);
      expect(midi.tracks.map((track) => track.name)).toEqual(expect.arrayContaining(["Melody", "Left hand"]));
    }
  });

  it("credits the source and says the harmony is original, and is public domain and eligible once published", () => {
    for (const piece of authored) {
      const credit = attributionFor(piece, null);
      expect(credit, piece.slug).toContain("arranged for Midivory");
      expect(credit).toContain("Harmony and bass are original to this project.");
      expect(credit).toMatch(/Public Domain\.$/);
      expect(fileLicenceOf(piece)).toBe("public-domain");
      expect(sourceKindOf(piece)).toBe("authored");
      expect(isPublicEligible({ sourceKind: "authored", fileLicence: "public-domain", workPdStatus: "pd-worldwide" })).toBe(true);
      expect((piece.primary as AuthoredPrimarySource).sourceUrl).toMatch(/^https:\/\//);
    }
  });

  it("reads every second-source excerpt into at least 8 notes in the score's key", () => {
    for (const piece of authored) {
      if (piece.second.kind !== "abc") continue;
      const tune = splitAbcTunes(piece.second.abc)[0]!;
      expect(abcMelody(tune).length, piece.slug).toBeGreaterThanOrEqual(8);
      expect(piece.second.url, piece.slug).toMatch(/^https:\/\//);
    }
  });

  it("checks the openings offline: a machine-readable second source passes, a scan is listed with a reason, nothing is rejected", async () => {
    const pack: Pack = { ...BATCH_D, pieces: authored };
    const report = await importPack({} as PrismaClient, pack, { dryRun: true, year: 2026 });
    expect(report.counts).toMatchObject({ rejected: 0, checked: 17 });
    const outcome = Object.fromEntries(report.pieces.map((piece) => [piece.slug, piece.incipit?.result]));
    const abcPieces = authored.filter((piece) => piece.second.kind === "abc");
    const scanPieces = authored.filter((piece) => piece.second.kind === "scan");
    expect(abcPieces).toHaveLength(8);
    expect(scanPieces).toHaveLength(9);
    for (const piece of scanPieces) {
      expect(outcome[piece.slug], piece.slug).toBe("none");
      expect(piece.second.kind === "scan" && piece.second.reason.length, piece.slug).toBeGreaterThan(40);
    }
    // Simple Gifts is the one flagged piece: Colin Hume's upbeat is two notes and The Session's is one, so the openings
    // share 15 of 16 notes but only 1 leading note. It is imported flagged for a reviewer, not rejected.
    const failed = abcPieces.filter((piece) => outcome[piece.slug] === "fail").map((piece) => piece.slug);
    expect(failed).toEqual(["simple-gifts"]);
    expect(report.pieces.find((piece) => piece.slug === "simple-gifts")!.incipit).toMatchObject({ matched: 1, lcs: 15 });
    expect(abcPieces.filter((piece) => outcome[piece.slug] === "pass")).toHaveLength(7);
    // Every authored piece is classified Good (never Verified: a reviewer approves) and public-eligible once published.
    expect(report.pieces.every((piece) => piece.tier === "good")).toBe(true);
    expect(report.publicEligible).toBe(17);
  });
});

describe("Batch D Mutopia pins", () => {
  it("pins every hymn by exact URL and sha256 as public domain, with the typesetter credited", () => {
    const hashes = new Set<string>();
    for (const piece of mutopia) {
      const primary = piece.primary as MutopiaPrimarySource;
      expect(primary.url, piece.slug).toMatch(/^https:\/\/www\.mutopiaproject\.org\/ftp\/.+\.mid$/);
      expect(primary.sha256, piece.slug).toMatch(/^[0-9a-f]{64}$/);
      expect(primary.licence).toBe("Public Domain");
      expect(primary.mutopiaRef, piece.slug).toMatch(new RegExp(`^Mutopia-\\d{4}/\\d\\d/\\d\\d-${primary.mutopiaId}$`));
      expect(primary.maintainer.length).toBeGreaterThan(3);
      expect(attributionFor(piece, null)).toContain(primary.maintainer);
      expect(fileLicenceOf(piece)).toBe("public-domain");
      hashes.add(primary.sha256);
    }
    expect(hashes.size).toBe(mutopia.length);
  });

  it("is checked against the Everyday Song Book where it has a second source, and a scan elsewhere", () => {
    const abc = mutopia.filter((piece) => piece.second.kind === "abc");
    expect(abc.map((piece) => piece.slug)).toEqual(["it-came-upon-the-midnight-clear"]);
    expect(mutopia.filter((piece) => piece.second.kind === "scan")).toHaveLength(8);
  });

  it("folds I Vow to Thee and the Jupiter theme into one Work", () => {
    const thaxted = pieces.find((piece) => piece.slug === "i-vow-to-thee-my-country")!;
    expect(thaxted.aliases?.map((alias) => alias.alias)).toEqual(expect.arrayContaining(["Thaxted", "Jupiter", "Jupiter Theme"]));
    expect(pieces.some((piece) => /jupiter/i.test(piece.slug))).toBe(false);
  });
});
