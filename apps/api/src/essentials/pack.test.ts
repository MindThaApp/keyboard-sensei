/**
 * Checks the generated Essentials files on disk: every piece's tune against
 * its manifest incipit, and every generated version against its level's
 * guarantees. Needs the gitignored pack (scripts/fetch-essentials-pack.ts then
 * scripts/generate-essentials-pack.ts); skipped when it isn't there, probing a
 * specific generated file rather than the folder.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import ToneMidi from "@tonejs/midi";
import { describe, expect, it } from "vitest";
import { ESSENTIALS_DIR, checkVersion, fullMelodies, incipitMatches, levelFileName, sourceFileName } from "./build.js";
import { ESSENTIALS, incipitPitches } from "./manifest.js";
import { readEssentialsIndex } from "./replacements.js";

const { Midi } = ToneMidi;
const present = existsSync(path.join(ESSENTIALS_DIR, levelFileName("fur-elise", "full")));

describe.skipIf(!present)("generated Essentials pack", () => {
  const index = present ? readEssentialsIndex() : [];

  it("ships every piece whose source was fetched, each with a Full version", () => {
    const fetched = ESSENTIALS.filter((piece) => existsSync(path.join(ESSENTIALS_DIR, sourceFileName(piece.slug))));
    const withFull = new Set(index.filter((entry) => entry.level === "full").map((entry) => entry.slug));
    expect(fetched.length).toBeGreaterThan(0);
    for (const piece of fetched) expect(withFull.has(piece.slug), piece.slug).toBe(true);
  });

  for (const piece of ESSENTIALS) {
    const sourcePath = path.join(ESSENTIALS_DIR, sourceFileName(piece.slug));
    it.skipIf(!existsSync(sourcePath))(`${piece.slug}: tune and every level check out`, () => {
      const source = new Midi(readFileSync(sourcePath));
      const incipit = incipitPitches(piece);
      expect(fullMelodies(source, piece).some((reading) => incipitMatches(reading, incipit, true).ok)).toBe(true);

      const entries = index.filter((entry) => entry.slug === piece.slug);
      const full = new Midi(readFileSync(path.join(ESSENTIALS_DIR, levelFileName(piece.slug, "full"))));
      for (const entry of entries) {
        const bytes = readFileSync(path.join(ESSENTIALS_DIR, entry.file));
        const version = new Midi(bytes);
        const result = checkVersion(source, piece, entry.level, bytes, entry.transpose, full.duration, entry.shiftSec);
        expect(result.problems, `${entry.file}`).toEqual([]);
        // Same length as the Full version to within 10% (a beginner's trimmed intro aside).
        const expected = full.duration - entry.shiftSec;
        expect(Math.abs(version.duration - expected), entry.file).toBeLessThanOrEqual(expected * 0.1);
      }
    });
  }
});
