import { describe, expect, it } from "vitest";
import { ESSENTIALS } from "../essentials/manifest.js";
import {
  emptyWorkFieldsToFill,
  fileLicenceFor,
  isPublicEligible,
  licenceFamily,
  pdStatus,
  sourceKindFor,
  workLinkFor,
  type SongRow,
} from "./backfill.js";
import { buildSearchText, catalogueTokens } from "./search-text.js";
import { COMPOSERS, CURATED_TIER_OVERRIDES, ESSENTIALS_WORKS, WORK_GENRES, BEGINNER_WORKS, composerIdFor } from "./works-data.js";

const LIB = "/app/apps/api/data/midi-library";
const row = (overrides: Partial<SongRow>): SongRow => ({
  id: "cuid-1",
  title: "Title",
  artist: "Traditional",
  file_path: `${LIB}/some.mid`,
  uploader_id: null,
  content_rights: "public-domain",
  arrangement_group: null,
  arrangement_level: null,
  retired_at: null,
  ...overrides,
});

describe("sourceKindFor", () => {
  it("reads the conventions each kind of song was created with", () => {
    expect(sourceKindFor(row({ id: "essentials-fur-elise-full", file_path: `${LIB}/essentials/fur-elise-full.mid` }))).toBe("essentials");
    expect(sourceKindFor(row({ id: "seed-scott-joplin-bethena" }))).toBe("adl");
    expect(sourceKindFor(row({ file_path: `${LIB}/beginner-hot-cross-buns.mid` }))).toBe("beginner");
    expect(sourceKindFor(row({ uploader_id: "u", content_rights: "user-upload" }))).toBe("upload");
    expect(sourceKindFor(row({ uploader_id: "u", content_rights: "user-import-url" }))).toBe("upload");
    expect(sourceKindFor(row({ uploader_id: "u", content_rights: "user-recording" }))).toBe("recording");
    expect(sourceKindFor(row({ uploader_id: "u", content_rights: "archive-import" }))).toBe("archive");
  });

  it("never takes a user's file for a curated one", () => {
    expect(sourceKindFor(row({ uploader_id: "u", file_path: `${LIB}/beginner-hot-cross-buns.mid`, content_rights: "user-upload" }))).toBe("upload");
    expect(sourceKindFor(row({ id: "essentials-x-full", uploader_id: "u", content_rights: "something" }))).toBe("upload");
    expect(sourceKindFor(row({ content_rights: "public-domain" }))).toBe("unknown");
  });
});

describe("licences", () => {
  it("records the licence of the file, not of the composition", () => {
    expect(fileLicenceFor("essentials", "cc-by-sa-2.5")).toBe("cc-by-sa-2.5");
    expect(fileLicenceFor("beginner", "public-domain")).toBe("public-domain");
    expect(fileLicenceFor("adl", "public-domain")).toBe("unknown");
    expect(fileLicenceFor("archive", "archive-import")).toBe("cc-by-nc-sa-4.0");
    expect(fileLicenceFor("upload", "user-upload")).toBe("unknown");
  });

  it("maps licence tags to their family", () => {
    expect(licenceFamily("cc-by-4.0")).toBe("cc-by");
    expect(licenceFamily("cc-by-sa-3.0")).toBe("cc-by-sa");
    expect(licenceFamily("cc-by-nc-sa-4.0")).toBe("cc-by-nc");
    expect(licenceFamily("public-domain")).toBe("public-domain");
    expect(licenceFamily(null)).toBe("unknown");
  });
});

describe("pdStatus (library spec 1.4)", () => {
  const at2026 = (died: number | null, publishedYear: number | null = null, traditional = false) => pdStatus({ traditional, died, publishedYear }, 2026);

  it("is worldwide public domain when the composer died over 100 years ago, or the work is traditional", () => {
    expect(at2026(1925)).toBe("pd-worldwide"); // Satie
    expect(at2026(null, null, true)).toBe("pd-worldwide");
  });

  it("is US/EU public domain for a composer dead 70 years whose work was published over 95 years ago", () => {
    expect(at2026(1943, 1893)).toBe("pd-us-eu"); // Rachmaninoff, Prelude Op. 3 No. 2
    expect(at2026(1934, 1931)).toBe("copyrighted"); // published too late for the US
    expect(at2026(1960, 1900)).toBe("copyrighted"); // life + 70 not yet expired
  });

  it("is unknown when a fact needed to decide is missing", () => {
    expect(at2026(null)).toBe("unknown");
    expect(at2026(1934)).toBe("unknown");
  });
});

describe("isPublicEligible (library spec 4.2)", () => {
  it("needs a public-domain Work, a free file licence and a curated source", () => {
    expect(isPublicEligible({ sourceKind: "essentials", fileLicence: "cc-by-sa-2.5", workPdStatus: "pd-worldwide" })).toBe(true);
    expect(isPublicEligible({ sourceKind: "beginner", fileLicence: "public-domain", workPdStatus: "pd-us-eu" })).toBe(true);
    expect(isPublicEligible({ sourceKind: "adl", fileLicence: "public-domain", workPdStatus: "pd-worldwide" })).toBe(false);
    expect(isPublicEligible({ sourceKind: "archive", fileLicence: "cc-by-nc-sa-4.0", workPdStatus: "pd-worldwide" })).toBe(false);
    expect(isPublicEligible({ sourceKind: "essentials", fileLicence: "cc-by-nc-4.0", workPdStatus: "pd-worldwide" })).toBe(false);
    expect(isPublicEligible({ sourceKind: "essentials", fileLicence: "public-domain", workPdStatus: "unknown" })).toBe(false);
    expect(isPublicEligible({ sourceKind: "essentials", fileLicence: "public-domain", workPdStatus: null })).toBe(false);
  });
});

describe("workLinkFor", () => {
  const link = (song: SongRow) => workLinkFor(song, sourceKindFor(song));

  it("groups every Essentials level of a piece into one Work", () => {
    for (const level of ["beginner", "intermediate", "full"]) {
      expect(link(row({ id: `essentials-fur-elise-${level}`, arrangement_group: "fur-elise", arrangement_level: level }))).toEqual({ workId: "fur-elise", via: "own" });
    }
  });

  it("joins a beginner-pack tune to the Essentials piece it duplicates, else gives it its own Work", () => {
    expect(link(row({ file_path: `${LIB}/beginner-silent-night.mid` }))).toEqual({ workId: "silent-night", via: "duplicate" });
    expect(link(row({ file_path: `${LIB}/beginner-hot-cross-buns.mid` }))).toEqual({ workId: "hot-cross-buns", via: "own" });
  });

  it("links library songs only through ESSENTIALS_REPLACES and DUPLICATE_OF", () => {
    expect(link(row({ id: "seed-ludwig-van-beethoven-fur-elise" }))).toEqual({ workId: "fur-elise", via: "duplicate" });
    // DUPLICATE_OF → the beginner pack's Ode to Joy → the Essentials piece.
    expect(link(row({ id: "seed-ludwig-van-beethoven-ode-to-joy" }))).toEqual({ workId: "ode-to-joy", via: "duplicate" });
    // DUPLICATE_OF → a library copy that Essentials replaced.
    expect(link(row({ id: "seed-frederic-chopin-fantaisie-impromptu" }))).toEqual({ workId: "fantaisie-impromptu", via: "duplicate" });
    // DUPLICATE_OF → a library copy with no Work: stays unlinked.
    expect(link(row({ id: "seed-erik-satie-gymnopedie-no2" }))).toBeNull();
    expect(link(row({ id: "seed-scott-joplin-bethena" }))).toBeNull();
  });

  it("never links users' songs", () => {
    expect(link(row({ uploader_id: "u", content_rights: "user-upload", file_path: `${LIB}/beginner-silent-night.mid` }))).toBeNull();
  });
});

describe("emptyWorkFieldsToFill", () => {
  const seed = {
    id: "w", title: "W", composer_id: "wolfgang-amadeus-mozart", catalogue: "K. 545", movement: null, era: "classical-era" as const,
    genre: "classical", published_year: null, pd_status: "pd-worldwide" as const, recognisability: 29, notes: null,
  };

  it("fills only empty fields and an undecided pd_status", () => {
    const stored = { composer_id: null, catalogue: "K 545 (edited)", movement: null, era: null, published_year: null, recognisability: 3, notes: null, pd_status: "unknown" };
    expect(emptyWorkFieldsToFill(stored, seed)).toEqual({ composer_id: "wolfgang-amadeus-mozart", era: "classical-era", pd_status: "pd-worldwide" });
  });

  it("returns nothing when every field is already set", () => {
    const stored = { composer_id: "x", catalogue: "c", movement: null, era: "baroque", published_year: null, recognisability: 1, notes: null, pd_status: "copyrighted" };
    expect(emptyWorkFieldsToFill(stored, seed)).toEqual({});
  });
});

describe("curated data", () => {
  it("covers every Essentials piece, with a known composer and a public-domain status", () => {
    for (const piece of ESSENTIALS) {
      expect(ESSENTIALS_WORKS[piece.slug], piece.slug).toBeDefined();
      const composerId = composerIdFor(piece.composer);
      expect(composerId, `${piece.slug}: ${piece.composer}`).not.toBeNull();
      const composer = COMPOSERS.find((entry) => entry.id === composerId)!;
      const status = pdStatus(
        { traditional: composerId === "traditional", died: composer.died, publishedYear: ESSENTIALS_WORKS[piece.slug]!.published_year ?? null },
        2026,
      );
      expect(["pd-worldwide", "pd-us-eu"], `${piece.slug}: ${status}`).toContain(status);
    }
    expect(Object.keys(ESSENTIALS_WORKS).sort()).toEqual(ESSENTIALS.map((piece) => piece.slug).sort());
  });

  it("uses only the catalogue's genres and unique composer ids", () => {
    for (const meta of [...Object.values(ESSENTIALS_WORKS), ...Object.values(BEGINNER_WORKS)]) expect(WORK_GENRES).toContain(meta.genre);
    expect(new Set(COMPOSERS.map((composer) => composer.id)).size).toBe(COMPOSERS.length);
  });

  it("resolves the beginner pack's credits", () => {
    for (const artist of ["Traditional", "Ludwig van Beethoven", "Franz Xaver Gruber", "Stephen Foster"]) expect(composerIdFor(artist), artist).not.toBeNull();
    expect(composerIdFor("Traditional (Welsh)")).toBe("traditional");
    expect(composerIdFor("Queen")).toBeNull();
  });

  it("overrides only real Essentials versions", () => {
    const slugs = new Set(ESSENTIALS.map((piece) => piece.slug));
    for (const id of Object.keys(CURATED_TIER_OVERRIDES)) {
      const match = /^essentials-(.+)-(beginner|intermediate|full)$/.exec(id);
      expect(match && slugs.has(match[1]!), id).toBe(true);
    }
  });
});

describe("search text", () => {
  it("normalises catalogue numbers to one token however they are written", () => {
    expect(catalogueTokens("K. 545")).toEqual(["k545"]);
    expect(catalogueTokens("KV545")).toEqual(["k545"]);
    expect(catalogueTokens("k 545")).toEqual(["k545"]);
    expect(catalogueTokens("Op. 27 No. 2")).toEqual(["op27"]);
    expect(catalogueTokens("Opus 13")).toEqual(["op13"]);
    expect(catalogueTokens("BWV 1068, WoO 59, D. 839, Hob 16, L. 75, S. 172, HWV 56, RV 269")).toEqual([
      "bwv1068", "woo59", "d839", "hob16", "l75", "s172", "hwv56", "rv269",
    ]);
  });

  it("finds no catalogue number in ordinary words", () => {
    expect(catalogueTokens("Prelude in D major, 1st movement, No. 5")).toEqual([]);
  });

  it("builds a deterministic text from the Work, its aliases, composer and tags", () => {
    const input = {
      title: "Für Elise",
      catalogue: "WoO 59",
      aliases: ["Fuer Elise", "WoO 59", "Bagatelle No. 25 in A minor"],
      composer: { name: "Ludwig van Beethoven", aliases: ["Beethoven"] },
      tags: ["Essentials"],
    };
    const text = buildSearchText(input);
    expect(text).toBe("Für Elise | WoO 59 | Fuer Elise | Bagatelle No. 25 in A minor | Ludwig van Beethoven | Beethoven | Essentials | woo59");
    expect(buildSearchText(input)).toBe(text);
  });
});
