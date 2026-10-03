/**
 * Generate the Essentials pack's Full / Intermediate / Beginner MIDI files from
 * the fetched sources, and verify every one before it is kept.
 *
 * For each piece:
 *   - Full: the source's notes unchanged, re-tracked into Right hand / Left
 *     hand on the source's own header (tempo map and meters untouched). Its
 *     tune must match the manifest incipit exactly, or the whole piece is
 *     dropped — a wrong melody is worse than a missing piece.
 *   - Intermediate and Beginner: simplifyArrangement() (packages/midi-engine).
 *     Each is re-parsed with @tonejs/midi (as the app does) and must pass its
 *     level's checks (incipit, monophony/range/rhythm or hand density,
 *     duration within 10% of the Full version). A level that fails is not
 *     written; the report says why.
 *
 * Writes data/midi-library/essentials/<slug>-<level>.mid plus index.json
 * (what prisma/seed.ts seeds) and report.json (every check, for review).
 *
 * Run after fetch-essentials-pack.ts:
 *   pnpm --filter @keyboard-sensei/api exec tsx scripts/generate-essentials-pack.ts
 */
import { existsSync } from "node:fs";
import { readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import ToneMidi from "@tonejs/midi";
import {
  ESSENTIALS_DIR,
  ESSENTIALS_INDEX,
  buildVersions,
  checkVersion,
  fullMelodies,
  incipitMatches,
  levelFileName,
  loadSource,
  sourceFileName,
  type EssentialsIndexEntry,
} from "../src/essentials/build.js";
import { ESSENTIALS, incipitPitches, type EssentialsLevel } from "../src/essentials/manifest.js";
import { extractSongMetadata } from "../src/midi-metadata.js";

const { Midi } = ToneMidi;
const NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B"];
const pitchName = (midi: number): string => `${NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;

interface ReportRow {
  slug: string;
  levels: Partial<Record<EssentialsLevel, { notes: number; durationSec: number; difficulty: number; transpose?: number }>>;
  rejected: Partial<Record<EssentialsLevel, string[]>>;
  fullMelodyStart: string;
}

async function main(): Promise<void> {
  const index: EssentialsIndexEntry[] = [];
  const report: ReportRow[] = [];
  let missing = 0;

  for (const piece of ESSENTIALS) {
    const sourcePath = path.join(ESSENTIALS_DIR, sourceFileName(piece.slug));
    if (!existsSync(sourcePath)) {
      missing++;
      continue;
    }
    const source = loadSource(await readFile(sourcePath), piece);
    const row: ReportRow = { slug: piece.slug, levels: {}, rejected: {}, fullMelodyStart: "" };
    report.push(row);

    const incipit = incipitPitches(piece);
    const readings = fullMelodies(source, piece);
    const melody = readings.find((reading) => incipitMatches(reading, incipit, true).ok) ?? readings[0];
    row.fullMelodyStart = melody.slice(0, incipit.length).map(pitchName).join(" ");
    const versions = buildVersions(source, piece);
    // Remove stale outputs first, so a level that now fails can't linger.
    for (const level of ["full", "intermediate", "beginner"] as const) {
      await unlink(path.join(ESSENTIALS_DIR, levelFileName(piece.slug, level))).catch(() => undefined);
    }
    if (!incipitMatches(melody, incipit, true).ok) {
      row.rejected.full = [`melody starts ${row.fullMelodyStart}, manifest says ${piece.incipit}`];
      console.warn(`DROP ${piece.slug}: ${row.rejected.full[0]}`);
      continue;
    }

    const fullDuration = new Midi(versions[0].bytes).duration;
    for (const version of versions) {
      const shiftSec = version.shiftBeats > 0 ? source.header.ticksToSeconds(version.shiftBeats * source.header.ppq) : 0;
      const check = checkVersion(source, piece, version.level, version.bytes, version.transpose, fullDuration, shiftSec);
      let meta: ReturnType<typeof extractSongMetadata> | null = null;
      try {
        meta = extractSongMetadata(new Uint8Array(version.bytes));
      } catch (error) {
        check.problems.push(error instanceof Error ? error.message : String(error));
      }
      if (!check.ok || !meta) {
        row.rejected[version.level] = check.problems;
        continue;
      }
      const file = levelFileName(piece.slug, version.level);
      await writeFile(path.join(ESSENTIALS_DIR, file), version.bytes);
      index.push({
        slug: piece.slug,
        level: version.level,
        file,
        noteCount: meta.noteCount,
        durationSec: meta.durationSec,
        transpose: version.transpose,
        shiftSec,
        timeScale: version.timeScale,
      });
      row.levels[version.level] = {
        notes: meta.noteCount,
        durationSec: Math.round(meta.durationSec),
        difficulty: meta.difficulty,
        ...(version.level === "beginner" ? { transpose: version.transpose } : {}),
      };
    }

    const summary = (["beginner", "intermediate", "full"] as const)
      .map((level) => (row.levels[level] ? `${level[0].toUpperCase()}:${row.levels[level]!.notes}` : `${level[0]}:✗`))
      .join(" ");
    console.log(`  ${piece.slug.padEnd(32)} ${summary}`);
    for (const [level, problems] of Object.entries(row.rejected)) console.log(`      ${level} rejected: ${problems.join("; ")}`);
  }

  await writeFile(ESSENTIALS_INDEX, `${JSON.stringify(index, null, 2)}\n`);
  await writeFile(path.join(ESSENTIALS_DIR, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  const pieces = new Set(index.map((entry) => entry.slug)).size;
  console.log(`\n${pieces} pieces, ${index.length} versions → ${ESSENTIALS_INDEX}`);
  if (missing > 0) console.warn(`${missing} pieces have no fetched source (run scripts/fetch-essentials-pack.ts)`);
  if (index.length === 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
