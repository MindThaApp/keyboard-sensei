import { describe, expect, it } from "vitest";
import { ESSENTIALS } from "../../essentials/manifest.js";
import { isPublicEligible, licenceFamily } from "../backfill.js";
import { isCreditedLicence, licenceUrl } from "../eligibility.js";
import { MOOD_TAGS, WORK_GENRES, composerIdFor } from "../works-data.js";
import { BATCH_A } from "./batch-a.js";
import { INCIPIT_REJECT_BELOW, commonPrefix, compareIncipits, lcsLength, pitchName } from "./incipit.js";
import { attributionFor, fileLicenceOf, isPianoMidiDe, mutopiaLicenceTag, pianoMidiDeCopyrightYear, songIdOf } from "./pack.js";

describe("Batch A pins", () => {
  const pieces = BATCH_A.pieces;

  it("lists the 41 piano-midi.de pieces of the proposal (the authored 42nd belongs elsewhere)", () => {
    expect(pieces).toHaveLength(41);
    expect(pieces.every((piece) => piece.primary.kind === "piano-midi-de")).toBe(true);
  });

  it("pins every file by exact URL and sha256, once", () => {
    for (const piece of pieces) {
      if (!isPianoMidiDe(piece.primary)) throw new Error(`${piece.slug} is not a piano-midi.de piece`);
      expect(piece.primary.url, piece.slug).toMatch(/^https:\/\//);
      expect(piece.primary.sha256, piece.slug).toMatch(/^[0-9a-f]{64}$/);
      if (piece.second.kind === "mutopia") {
        expect(piece.second.url, piece.slug).toMatch(/^https:\/\/www\.mutopiaproject\.org\/ftp\//);
        expect(piece.second.sha256, piece.slug).toMatch(/^[0-9a-f]{64}$/);
      }
    }
    expect(new Set(pieces.map((piece) => songIdOf(piece))).size).toBe(pieces.length);
    expect(new Set(pieces.map((piece) => piece.slug)).size).toBe(pieces.length);
  });

  it("splits second sources as the proposal does, minus the mis-paired Funeral March", () => {
    expect(pieces.filter((piece) => piece.second.kind === "mutopia")).toHaveLength(22);
    expect(pieces.filter((piece) => piece.second.kind === "scan")).toHaveLength(19);
    const funeral = pieces.find((piece) => piece.slug === "chopin-funeral-march")!;
    expect(funeral.second).toMatchObject({ kind: "scan" });
    expect(funeral.second.kind === "scan" && funeral.second.reason).toMatch(/Mutopia 1727/);
  });

  it("uses only known composers, genres and mood tags, and no Essentials Work id", () => {
    const essentialsIds = new Set(ESSENTIALS.map((piece) => piece.slug));
    for (const piece of pieces) {
      expect(composerIdFor(piece.composer), piece.composer).not.toBeNull();
      expect(WORK_GENRES).toContain(piece.genre);
      for (const tag of piece.tags ?? []) expect(Object.keys(MOOD_TAGS)).toContain(tag);
      expect(essentialsIds.has(piece.slug), piece.slug).toBe(false);
    }
  });

  it("credits Bernd Krueger and the licence, with a link, on every piece", () => {
    for (const piece of pieces) {
      const credit = attributionFor(piece, 1998);
      expect(credit, piece.slug).toContain("Bernd Krueger");
      expect(credit).toContain("piano-midi.de");
      expect(credit).toContain("CC BY-SA 3.0 DE");
      expect(credit).toContain("https://creativecommons.org/licenses/by-sa/3.0/de/");
      expect(isPianoMidiDe(piece.primary)).toBe(true);
      expect(fileLicenceOf(piece)).toBe("cc-by-sa-3.0-de");
    }
  });
});

describe("piano-midi.de licence handling", () => {
  it("links the German port of the licence and counts it as a credited CC licence", () => {
    expect(licenceUrl("cc-by-sa-3.0-de")).toBe("https://creativecommons.org/licenses/by-sa/3.0/de/");
    expect(licenceUrl("cc-by-sa-2.5")).toBe("https://creativecommons.org/licenses/by-sa/2.5/");
    expect(isCreditedLicence("cc-by-sa-3.0-de")).toBe(true);
    expect(licenceFamily("cc-by-sa-3.0-de")).toBe("cc-by-sa");
  });

  it("keeps piano-midi.de out of public builds until the owner confirms the licence", () => {
    const free = { fileLicence: "cc-by-sa-3.0-de", workPdStatus: "pd-worldwide" };
    expect(isPublicEligible({ sourceKind: "piano-midi-de", ...free })).toBe(false);
    // Mutopia, with the same licence family and composition status, is unaffected.
    expect(isPublicEligible({ sourceKind: "mutopia", fileLicence: "cc-by-sa-3.0", workPdStatus: "pd-worldwide" })).toBe(true);
  });

  it("reads Bernd Krueger's copyright year from the file, in either spelling", () => {
    expect(pianoMidiDeCopyrightYear(["Piano left", "Copyright © 1998 by Bernd Krueger"])).toBe(1998);
    expect(pianoMidiDeCopyrightYear(["Copyright © 2001 by Bernd Krüger"])).toBe(2001);
    expect(pianoMidiDeCopyrightYear(["Copyright © 1998 by Somebody Else", ""])).toBeNull();
  });

  it("maps Mutopia licence names to tags", () => {
    expect(mutopiaLicenceTag("Public Domain")).toBe("public-domain");
    expect(mutopiaLicenceTag("Creative Commons Attribution 4.0")).toBe("cc-by-4.0");
    expect(mutopiaLicenceTag("Creative Commons Attribution-ShareAlike 2.5")).toBe("cc-by-sa-2.5");
  });
});

describe("incipit comparison", () => {
  const opening = [72, 71, 69, 71, 72, 74, 76, 74, 72, 71, 69, 67];

  it("passes a shared prefix of eight or more notes", () => {
    expect(compareIncipits(opening, [...opening.slice(0, 10), 60, 61])).toMatchObject({ result: "pass", matched: 10 });
  });

  it("fails an opening that diverges early, and reports how much is still shared", () => {
    const edition = [72, 69, 71, 72, 74, 76, 74, 72, 71, 69, 67, 65];
    const result = compareIncipits(opening, edition);
    expect(result.result).toBe("fail");
    expect(result.matched).toBe(1);
    expect(result.lcs).toBeGreaterThanOrEqual(INCIPIT_REJECT_BELOW);
  });

  it("shares almost nothing with another piece", () => {
    const other = [50, 52, 53, 55, 57, 59, 60, 62, 64, 65, 67, 69];
    expect(compareIncipits(opening, other).lcs).toBeLessThan(INCIPIT_REJECT_BELOW);
  });

  it("measures prefix and subsequence lengths", () => {
    expect(commonPrefix([1, 2, 3], [1, 2, 4])).toBe(2);
    expect(lcsLength([1, 2, 3, 4], [2, 4, 5])).toBe(2);
    expect(lcsLength([], [1])).toBe(0);
  });

  it("names pitches by scientific notation", () => {
    expect(pitchName(60)).toBe("C4");
    expect(pitchName(73)).toBe("C#5");
  });
});
