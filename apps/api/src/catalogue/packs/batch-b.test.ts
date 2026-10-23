import { describe, expect, it } from "vitest";
import { ESSENTIALS } from "../../essentials/manifest.js";
import { isPublicEligible } from "../backfill.js";
import { BEGINNER_WORKS, ESSENTIALS_WORKS, MOOD_TAGS, WORK_GENRES, composerIdFor } from "../works-data.js";
import { BATCH_A } from "./batch-a.js";
import { BATCH_B } from "./batch-b.js";
import { attributionFor, fileLicenceOf, songIdOf, type MutopiaPrimarySource } from "./pack.js";

const pieces = BATCH_B.pieces;
const primary = (index: number): MutopiaPrimarySource => pieces[index]!.primary as MutopiaPrimarySource;

const normalise = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

describe("Batch B pins", () => {
  it("lists 44 works from 39 of the 46 proposal rows", () => {
    expect(pieces).toHaveLength(44);
    // 46 rows - 6 authored (3, 5, 31, 32, 42, 43) - Bartok (44, under the 20 s minimum) = 39 rows. Rows 25, 26 and 27
    // are one Work per file (3 + 2 + 3), row 24 keeps only Op. 821 No. 5 (Nos. 1-4 are under the minimum).
    expect(pieces.filter((piece) => /^czerny-821-/.test(piece.slug)).map((piece) => piece.slug)).toEqual(["czerny-821-5"]);
    expect(pieces.filter((piece) => /^czerny-840-/.test(piece.slug))).toHaveLength(3);
    expect(pieces.filter((piece) => /^clementi-/.test(piece.slug))).toHaveLength(2);
    expect(pieces.filter((piece) => /^kuhlau-/.test(piece.slug))).toHaveLength(3);
  });

  it("uses a Mutopia file as every primary and lists a scan as every second source, with a reason", () => {
    for (const piece of pieces) {
      expect(piece.primary.kind, piece.slug).toBe("mutopia");
      expect(piece.second.kind, piece.slug).toBe("scan");
      expect(piece.second.kind === "scan" && piece.second.reason.length, piece.slug).toBeGreaterThan(20);
    }
  });

  it("pins every file by exact URL and sha256, and gives every piece its own Work and Song id", () => {
    for (const piece of pieces) {
      const source = piece.primary as MutopiaPrimarySource;
      expect(source.url, piece.slug).toMatch(/^https:\/\/www\.mutopiaproject\.org\/ftp\/.+\.(mid|zip)$/);
      expect(source.sha256, piece.slug).toMatch(/^[0-9a-f]{64}$/);
      expect(source.mutopiaRef, piece.slug).toMatch(/^Mutopia-\d{4}\/\d{2}\/\d{2}-\d+$/);
      expect(source.infoUrl).toBe(`https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=${source.mutopiaId}`);
      expect(source.url.endsWith(".zip"), piece.slug).toBe(Boolean(source.member));
    }
    expect(new Set(pieces.map((piece) => songIdOf(piece))).size).toBe(pieces.length);
    expect(new Set(pieces.map((piece) => piece.slug)).size).toBe(pieces.length);
  });

  it("gives the movements of one Mutopia zip separate Song ids", () => {
    const clementi = pieces.filter((piece) => piece.slug.startsWith("clementi-"));
    expect(clementi.map((piece) => songIdOf(piece))).toEqual(["mutopia-804-sonatina-1-1", "mutopia-804-sonatina-1-2"]);
  });

  it("uses only known composers, genres and mood tags", () => {
    for (const piece of pieces) {
      expect(composerIdFor(piece.composer), piece.composer).not.toBeNull();
      expect(WORK_GENRES).toContain(piece.genre);
      for (const tag of piece.tags ?? []) expect(Object.keys(MOOD_TAGS)).toContain(tag);
      expect(piece.level).toBeGreaterThanOrEqual(1);
      expect(piece.level).toBeLessThanOrEqual(5);
    }
  });

  it("merge check: no Work id, title or alias duplicates an Essentials piece, a Batch A piece or another Batch B piece", () => {
    const existing = new Map<string, string>();
    const claim = (key: string, owner: string): void => {
      existing.set(key, owner);
    };
    for (const essential of ESSENTIALS) {
      claim(`id:${essential.slug}`, essential.slug);
      claim(`title:${normalise(essential.title)}`, essential.slug);
    }
    for (const piece of BATCH_A.pieces) {
      claim(`id:${piece.slug}`, piece.slug);
      claim(`title:${normalise(piece.title)}`, piece.slug);
    }
    // Aliases already on file (Essentials and beginner-pack Works): a Batch B title may not be one of them.
    const aliases = new Set<string>();
    for (const meta of [...Object.values(ESSENTIALS_WORKS), ...Object.values(BEGINNER_WORKS)]) {
      for (const alias of meta.aliases ?? []) if (alias.kind !== "catalogue") aliases.add(normalise(alias.alias));
    }
    for (const id of [...Object.keys(ESSENTIALS_WORKS), ...Object.keys(BEGINNER_WORKS)]) expect(pieces.some((piece) => piece.slug === id), id).toBe(false);
    const seen = new Map<string, string>();
    for (const piece of pieces) {
      expect(aliases.has(normalise(piece.title)), `${piece.slug} title is an existing alias`).toBe(false);
      expect(existing.get(`id:${piece.slug}`), `${piece.slug} id`).toBeUndefined();
      expect(existing.get(`title:${normalise(piece.title)}`), `${piece.slug} title`).toBeUndefined();
      for (const alias of piece.aliases ?? []) {
        // An alias may not be another Work's title. Series names ("Album for the Young") are aliases of
        // several sibling pieces on purpose, so aliases are not compared with each other.
        if (alias.kind === "catalogue") continue;
        const clash = existing.get(`title:${normalise(alias.alias)}`);
        expect(clash, `${piece.slug} alias "${alias.alias}" clashes with ${clash}`).toBeUndefined();
      }
      const titleKey = normalise(piece.title);
      expect(seen.get(titleKey), `${piece.slug} repeats a title`).toBeUndefined();
      seen.set(titleKey, piece.slug);
    }
  });

  it("does not repeat a catalogue number across different pieces of one composer unless they are movements of one work", () => {
    const byCatalogue = new Map<string, string[]>();
    for (const piece of pieces) {
      if (!piece.catalogue) continue;
      const key = `${piece.composer}|${piece.catalogue}`;
      byCatalogue.set(key, [...(byCatalogue.get(key) ?? []), piece.slug]);
    }
    for (const [key, slugs] of byCatalogue) {
      if (slugs.length > 1) expect(slugs.every((slug) => /(clementi|kuhlau)-/.test(slug)), key).toBe(true);
    }
  });

  it("credits the typesetter and carries a free licence on every piece, so all are eligible once published", () => {
    for (const piece of pieces) {
      const source = piece.primary as MutopiaPrimarySource;
      const credit = attributionFor(piece, null);
      expect(credit, piece.slug).toContain("Mutopia Project");
      expect(credit).toContain(source.mutopiaRef);
      expect(credit).toContain(source.licence);
      expect(credit).toContain(source.infoUrl);
      if (source.maintainer !== "Anonymous") expect(credit).toContain(source.maintainer);
      expect(source.maintainer, piece.slug).not.toMatch(/@|https?:|gmail/);
      expect(isPublicEligible({ sourceKind: "mutopia", fileLicence: fileLicenceOf(piece), workPdStatus: "pd-worldwide" }), piece.slug).toBe(true);
    }
  });

  it("names the Burgmüller studies by their real Op. 100 numbers (La Babillarde is No. 17, not 13)", () => {
    const babillarde = pieces.find((piece) => piece.slug === "burgmuller-la-babillarde")!;
    expect(babillarde.catalogue).toBe("Op. 100 No. 17");
    expect((babillarde.primary as MutopiaPrimarySource).url).toContain("25EF-17");
    expect(primary(pieces.indexOf(babillarde)).mutopiaId).toBe("229");
  });
});
