/**
 * Existing songs that an Essentials piece supersedes, and how they are retired.
 *
 * Keyed on stable ids, never display titles:
 *   - `library`: ADL manifest ids (rows `seed-<id>`, scripts/midi-manifest.json);
 *   - `beginnerPack`: slugs of scripts/generate-beginner-pack.ts (rows whose
 *     file is `beginner-<slug>.mid`).
 *
 * Every pair below was checked by hand to be the same work (and, where the
 * movement could be ambiguous, the opening melodies were compared note by
 * note). Deliberately NOT replaced: Vivaldi "Spring" (the dataset file's
 * opening doesn't match the 1st movement, so it may be another movement),
 * Clementi "Sonatina 1-1"/"1-2" (other movements), Moonlight 2nd movement,
 * and Debussy "Au Clair de la Lune" (a folk song, not Clair de Lune).
 *
 * Policy (applied on every seed, so it is idempotent): a superseded library
 * row is deleted if nobody has a play-along attempt on it; otherwise it is
 * retired — hidden from the list, history intact. Superseded beginner-pack
 * rows are always retired (see below). Rows with an uploader are never
 * touched. A replacement only applies once the Essentials version exists, and
 * a retired row comes back if its replacement disappears.
 */
import type { PrismaClient } from "@prisma/client";
import { ESSENTIALS_INDEX, type EssentialsIndexEntry } from "./build.js";
import { readFileSync } from "node:fs";

export interface Replacement {
  library?: string[];
  beginnerPack?: string[];
}

export const ESSENTIALS_REPLACES: Record<string, Replacement> = {
  "fur-elise": { library: ["ludwig-van-beethoven-fur-elise"] },
  "moonlight-sonata-1": { library: ["ludwig-van-beethoven-moonlight-sonata-1st-movement"] },
  "moonlight-sonata-3": { library: ["ludwig-van-beethoven-moonlight-sonata-3rd-movement"] },
  "beethoven-5th-symphony": { library: ["ludwig-van-beethoven-beethovens-5th"] },
  "pathetique-2": { library: ["ludwig-van-beethoven-adagio-cantabile", "ludwig-van-beethoven-andante-cantabile-op13"] },
  "ode-to-joy": { library: ["ludwig-van-beethoven-ode-to-joy"], beginnerPack: ["ode-to-joy"] },
  "fantaisie-impromptu": { library: ["frederic-chopin-fantaisie-impromptu", "frederic-chopin-fantaisie-impromptu-op-66"] },
  "minute-waltz": { library: ["frederic-chopin-minute-waltz"] },
  "nocturne-op-9-no-2": { library: ["frederic-chopin-nocturne-op-9-no-2"] },
  "gymnopedie-1": { library: ["erik-satie-gymnopedie-no-1"] },
  "clair-de-lune": { library: ["claude-debussy-clair-de-lune"] },
  "canon-in-d": { library: ["johann-pachelbel-canon-in-d", "johann-pachelbel-canon"] },
  "brahms-lullaby": { library: ["johannes-brahms-lullaby"] },
  "schubert-ave-maria": { library: ["franz-schubert-ave-maria", "franz-schubert-ave-maria-ellens-dritter-gesang"] },
  "the-entertainer": { library: ["scott-joplin-entertainer"] },
  "clementi-sonatina-op-36-1": { library: ["muzio-clementi-sonatina-1", "muzio-clementi-sonatine-no1"] },
  promenade: { library: ["modest-mussorgsky-pictures-at-an-exhibition-promenade"] },
  "consolation-3": { library: ["franz-liszt-consolation-s172-no3"] },
  "march-of-the-wooden-soldiers": { library: ["pyotr-ilyich-tchaikovsky-march-of-the-wooden-soldiers"] },
  "silent-night": { beginnerPack: ["silent-night"] },
  "amazing-grace": { beginnerPack: ["amazing-grace"] },
  greensleeves: { beginnerPack: ["greensleeves"] },
};

/** The generated Essentials versions on disk (empty if the pack was never generated). */
export function readEssentialsIndex(indexPath = ESSENTIALS_INDEX): EssentialsIndexEntry[] {
  try {
    return JSON.parse(readFileSync(indexPath, "utf8")) as EssentialsIndexEntry[];
  } catch {
    return [];
  }
}

/**
 * Library manifest ids that should no longer be seeded, given what Essentials
 * versions exist: a library song is superseded only by a generated Full version.
 */
export function supersededLibraryIds(index: EssentialsIndexEntry[]): Set<string> {
  const full = new Set(index.filter((entry) => entry.level === "full").map((entry) => entry.slug));
  const ids = new Set<string>();
  for (const [slug, replacement] of Object.entries(ESSENTIALS_REPLACES)) {
    if (full.has(slug)) for (const id of replacement.library ?? []) ids.add(id);
  }
  return ids;
}

/** Beginner-pack slugs superseded: only once the Essentials Beginner version exists. */
export function supersededBeginnerSlugs(index: EssentialsIndexEntry[]): Set<string> {
  const beginner = new Set(index.filter((entry) => entry.level === "beginner").map((entry) => entry.slug));
  const slugs = new Set<string>();
  for (const [slug, replacement] of Object.entries(ESSENTIALS_REPLACES)) {
    if (beginner.has(slug)) for (const old of replacement.beginnerPack ?? []) slugs.add(old);
  }
  return slugs;
}

export interface ReplacementReport {
  deleted: string[];
  retired: string[];
  restored: string[];
}

type SongRow = { id: string; title: string; file_path: string; uploader_id: string | null; retired_at: Date | null; _count: { attempts: number } };

export async function applyEssentialsReplacements(prisma: PrismaClient, index: EssentialsIndexEntry[]): Promise<ReplacementReport> {
  const report: ReplacementReport = { deleted: [], retired: [], restored: [] };
  const libraryIds = supersededLibraryIds(index);
  const beginnerSlugs = supersededBeginnerSlugs(index);
  const select = { id: true, title: true, file_path: true, uploader_id: true, retired_at: true, _count: { select: { attempts: true } } } as const;

  const allLibrary = Object.values(ESSENTIALS_REPLACES).flatMap((r) => r.library ?? []);
  const allBeginner = Object.values(ESSENTIALS_REPLACES).flatMap((r) => r.beginnerPack ?? []);
  const libraryRows = await prisma.song.findMany({ where: { id: { in: allLibrary.map((id) => `seed-${id}`) } }, select });
  const beginnerRows = await prisma.song.findMany({
    where: { uploader_id: null, OR: allBeginner.map((slug) => ({ file_path: { endsWith: `/beginner-${slug}.mid` } })) },
    select,
  });

  const superseded = (row: SongRow): boolean => {
    if (row.id.startsWith("seed-")) return libraryIds.has(row.id.slice("seed-".length));
    const slug = /beginner-(.+)\.mid$/.exec(row.file_path)?.[1];
    return slug !== undefined && beginnerSlugs.has(slug);
  };

  for (const row of [...libraryRows, ...beginnerRows] as SongRow[]) {
    if (row.uploader_id) continue;
    const label = `${row.title} (${row.id})`;
    if (!superseded(row)) {
      if (row.retired_at) {
        await prisma.song.update({ where: { id: row.id }, data: { retired_at: null } });
        report.restored.push(label);
      }
      continue;
    }
    // Beginner-pack rows are always retired, never deleted: its generator
    // finds rows by file path, so a deleted row would come back on its next
    // run, while a retired one stays retired.
    const isBeginnerPack = !row.id.startsWith("seed-");
    if (row._count.attempts === 0 && !isBeginnerPack) {
      await prisma.song.delete({ where: { id: row.id } });
      report.deleted.push(label);
    } else if (!row.retired_at) {
      await prisma.song.update({ where: { id: row.id }, data: { retired_at: new Date() } });
      report.retired.push(`${label}, ${row._count.attempts} attempt(s)`);
    }
  }
  return report;
}
