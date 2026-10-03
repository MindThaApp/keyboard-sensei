/**
 * Seed the generated Essentials versions as songs (called from prisma/seed.ts).
 *
 * Each version is a row `essentials-<slug>-<level>`, grouped by
 * `arrangement_group` = slug so the client can offer "Beginner / Intermediate
 * / Full" for one piece. Difficulty, duration and note count come from the
 * same `extractSongMetadata` every other song uses, so levels compare fairly
 * with the rest of the library. Idempotent; then superseded songs are retired
 * (see ./replacements.ts).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";
import { extractSongMetadata } from "../midi-metadata.js";
import { ESSENTIALS_DIR, type EssentialsIndexEntry } from "./build.js";
import { ESSENTIALS, attribution, contentRights, type EssentialsLevel } from "./manifest.js";
import { applyEssentialsReplacements, readEssentialsIndex, type ReplacementReport } from "./replacements.js";

const LEVEL_SUFFIX: Record<EssentialsLevel, string> = { beginner: " (Beginner)", intermediate: " (Intermediate)", full: "" };

export const essentialsSongId = (slug: string, level: EssentialsLevel): string => `essentials-${slug}-${level}`;

export interface EssentialsSeedReport {
  seeded: number;
  removed: string[];
  replacements: ReplacementReport;
}

export async function seedEssentials(prisma: PrismaClient, index: EssentialsIndexEntry[] = readEssentialsIndex()): Promise<EssentialsSeedReport> {
  const bySlug = new Map(ESSENTIALS.map((piece) => [piece.slug, piece]));
  const kept = new Set<string>();
  let seeded = 0;

  for (const entry of index) {
    const piece = bySlug.get(entry.slug);
    const file_path = path.join(ESSENTIALS_DIR, entry.file);
    if (!piece || !existsSync(file_path)) continue;
    const meta = extractSongMetadata(new Uint8Array(readFileSync(file_path)));
    const id = essentialsSongId(entry.slug, entry.level);
    const data = {
      title: `${piece.title}${LEVEL_SUFFIX[entry.level]}`,
      artist: piece.composer,
      genre: piece.genre,
      difficulty: meta.difficulty,
      duration_sec: meta.durationSec,
      note_count: meta.noteCount,
      content_rights: contentRights(piece),
      source_url: piece.source.infoUrl,
      attribution: attribution(piece),
      file_path,
      uploader_id: null,
      arrangement_group: entry.slug,
      arrangement_level: entry.level,
      retired_at: null,
    };
    await prisma.song.upsert({ where: { id }, create: { id, ...data }, update: data });
    kept.add(id);
    seeded++;
  }

  // Versions that are no longer generated (a level that now fails its checks):
  // delete if unplayed, otherwise retire to keep the history.
  const removed: string[] = [];
  const stale = await prisma.song.findMany({
    where: { id: { startsWith: "essentials-" }, uploader_id: null },
    select: { id: true, retired_at: true, _count: { select: { attempts: true } } },
  });
  for (const row of stale) {
    if (kept.has(row.id)) continue;
    if (row._count.attempts === 0) await prisma.song.delete({ where: { id: row.id } });
    else if (!row.retired_at) await prisma.song.update({ where: { id: row.id }, data: { retired_at: new Date() } });
    removed.push(row.id);
  }

  const replacements = await applyEssentialsReplacements(prisma, index);
  return { seeded, removed, replacements };
}
