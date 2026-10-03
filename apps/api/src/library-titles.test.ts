import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DUPLICATE_OF,
  TITLE_OVERRIDES,
  duplicateKey,
  normalizeSongTitle,
  prepareLibraryManifest,
} from "./library-titles.js";

// The committed manifest (scripts/midi-manifest.json) — real data, available in CI.
const manifestPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../scripts/midi-manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { id: string; title: string; artist: string }[];

describe("normalizeSongTitle", () => {
  it.each([
    ["13Mai, cher Mai", "Mai, cher Mai"],
    ["25Echos du Théâtre", "Echos du Théâtre"],
    ["I Do_ I Do_ I Do_ I Do_ I Do", "I Do, I Do, I Do, I Do, I Do"],
    ["Fantaisie-Impromptu_ Op 66", "Fantaisie-Impromptu, Op 66"],
    ["Etude Op10, no3", "Etude Op 10, No 3"],
    ["Hungarian Dance N 7", "Hungarian Dance No 7"],
    ["Ballade number 4", "Ballade No 4"],
    ["Andante(from Symphony No3)", "Andante (from Symphony No 3)"],
    ["(Let Me Be ) Your Teddy Bear", "(Let Me Be) Your Teddy Bear"],
    ["Heartache Tonight (LP Version)", "Heartache Tonight"],
    ["Waltz Of The Flowers", "Waltz of the Flowers"],
    ["A Rush Of Blood To The Head", "A Rush of Blood to the Head"],
    ["Life Is Real (Song For Lennon)", "Life Is Real (Song for Lennon)"],
    ["July - Song of the Reaper", "July - Song of the Reaper"],
  ])("%s → %s", (raw, expected) => {
    expect(normalizeSongTitle(raw)).toBe(expected);
  });

  it("leaves real leading numbers and non-English titles alone", () => {
    for (const title of ["1812 Overture", "52nd Street", "6 Partitas, Clavierubung part I, No 1", "7th Symphony", "Der Tod und das Mädchen", "Auf dem Strom"]) {
      expect(normalizeSongTitle(title)).toBe(title);
    }
  });

  it("does not lowercase a key name ('in A Major')", () => {
    expect(normalizeSongTitle("Serenade No2 In A Major OP16 Adagio")).toBe("Serenade No 2 in A Major Op 16 Adagio");
  });

  it("is idempotent on every manifest title", () => {
    for (const entry of manifest) {
      const once = normalizeSongTitle(entry.title);
      expect(normalizeSongTitle(once)).toBe(once);
    }
  });
});

describe("duplicateKey", () => {
  it("matches spelling variants of the same title", () => {
    expect(duplicateKey("Satie", "Gymnopedie No2")).toBe(duplicateKey("Satie", "Gymnopédie No 2"));
    expect(duplicateKey("Menken", "Color of the Wind")).toBe(duplicateKey("Menken", "Colors of the Wind"));
  });

  it("keeps different artists apart", () => {
    expect(duplicateKey("A", "Air")).not.toBe(duplicateKey("B", "Air"));
  });
});

describe("prepareLibraryManifest on the real manifest", () => {
  const prepared = prepareLibraryManifest(manifest);

  it("only references manifest ids that exist", () => {
    const ids = new Set(manifest.map((entry) => entry.id));
    for (const id of Object.keys(TITLE_OVERRIDES)) expect(ids, id).toContain(id);
    for (const [dropId, keepId] of Object.entries(DUPLICATE_OF)) {
      expect(ids, dropId).toContain(dropId);
      if (!keepId.startsWith("beginner-pack:")) expect(ids, keepId).toContain(keepId);
      expect(DUPLICATE_OF[keepId], `${keepId} is itself dropped`).toBeUndefined();
    }
  });

  it("leaves no same-artist duplicates", () => {
    expect(prepared.unresolvedDuplicates).toEqual([]);
  });

  it("fixes the titles a live review flagged", () => {
    const titles = prepared.entries.map((entry) => entry.title);
    expect(titles).toContain("Mai, cher Mai");
    expect(titles).toContain("I Do, I Do, I Do, I Do, I Do");
    expect(titles).toContain("Colors of the Wind");
    expect(titles).not.toContain("Color of the Wind");
    expect(titles.filter((title) => /^\d{1,2}\p{Lu}/u.test(title) || title.includes("_"))).toEqual([]);
  });

  it("never changes ids, and is idempotent", () => {
    const again = prepareLibraryManifest(prepared.entries);
    expect(again.entries).toEqual(prepared.entries);
    expect(again.renamed).toEqual([]);
    expect(prepared.entries.every((entry) => manifest.some((original) => original.id === entry.id))).toBe(true);
  });
});
