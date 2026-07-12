/**
 * Populate ArchiveEntry with the PianoCoRe bulk-archive catalog.
 *
 * Source: SyMuPe/PianoCoRe (Zenodo record 19186016; mirrored on HuggingFace
 * as SyMuPe/PianoCoRe). metadata.csv (~196MB) lists 250,046 performance rows
 * covering 5,625 unique pieces (composer + composition + movement) -- this
 * script downloads ONLY that metadata (never the ~16GB of actual MIDI/
 * MusicXML bytes). One representative performance is chosen per unique
 * piece, preferring a `tier_a`/`tier_a_star` row (these have `score_xml`
 * available, enabling real OSMD notation later) over a plain performance
 * row.
 *
 * `source_ref` stores "<split>:<offset>", where `offset` is this row's
 * 0-indexed position within metadata.csv's rows filtered to that split, in
 * original file order. This exactly matches the HuggingFace Datasets Server
 * per-split row offset (verified directly: metadata.csv's first `split ==
 * "train"` row is `PianoCoRe_000009`, and
 * `https://datasets-server.huggingface.co/rows?dataset=SyMuPe/PianoCoRe&config=default&split=train&offset=0&length=1`
 * returns that same row). Task 5's import endpoint uses `source_ref` to
 * refetch that single row's actual bytes on demand -- no bulk download ever
 * happens for this dataset.
 *
 * Usage: pnpm --filter @keyboard-sensei/api exec tsx scripts/ingest-piano-archive.ts
 */
import "dotenv/config";
import { createWriteStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { PrismaClient, type Prisma } from "@prisma/client";

const METADATA_URL = "https://zenodo.org/records/19186016/files/metadata.csv?download=1";
const CACHE_PATH = path.join(tmpdir(), "ks-piano-archive-metadata.csv");

async function ensureMetadataCsv(): Promise<string> {
  if (await stat(CACHE_PATH).then((s) => s.isFile()).catch(() => false)) {
    console.log(`Using cached metadata.csv at ${CACHE_PATH}`);
    return CACHE_PATH;
  }
  console.log(`Downloading ${METADATA_URL} ...`);
  const response = await fetch(METADATA_URL);
  if (!response.ok || !response.body) throw new Error(`Download failed: HTTP ${response.status}`);
  await pipeline(Readable.fromWeb(response.body as never), createWriteStream(CACHE_PATH));
  return CACHE_PATH;
}

/**
 * Minimal RFC4180 CSV parser (handles quoted fields containing
 * commas/quotes/newlines). Streams rows to `onRow` rather than
 * materializing the whole table -- metadata.csv is ~196MB/250k rows, and
 * holding the raw text plus a fully-parsed nested array simultaneously
 * exhausts the default heap.
 */
function parseCsvRows(text: string, onRow: (cells: string[]) => void): void {
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") onRow(row);
      row = [];
    } else if (c === "\r") {
      // swallow; \n (handled above) ends the row
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0] !== "") onRow(row);
  }
}

interface MetaRow {
  composer: string;
  composition: string;
  movement: string;
  split: string;
  tier_a: string;
  tier_a_star: string;
  quality_label: string;
  score_note_count: string;
  score_duration: string;
  performance_note_count: string;
  performance_duration: string;
}

const representativeScore = (row: MetaRow): number => {
  if (row.tier_a_star === "True") return 3;
  if (row.tier_a === "True") return 2;
  if (row.quality_label === "high quality") return 1;
  return 0;
};

interface Candidate {
  row: MetaRow;
  offset: number;
  score: number;
}

interface ColumnIndex {
  composer: number;
  composition: number;
  movement: number;
  split: number;
  tier_a: number;
  tier_a_star: number;
  quality_label: number;
  score_note_count: number;
  score_duration: number;
  performance_note_count: number;
  performance_duration: number;
}

function resolveColumns(header: string[]): ColumnIndex {
  const col = (name: string): number => {
    const i = header.indexOf(name);
    if (i === -1) throw new Error(`metadata.csv missing expected column: ${name}`);
    return i;
  };
  return {
    composer: col("composer"),
    composition: col("composition"),
    movement: col("movement"),
    split: col("split"),
    tier_a: col("tier_a"),
    tier_a_star: col("tier_a_star"),
    quality_label: col("quality_label"),
    score_note_count: col("score_note_count"),
    score_duration: col("score_duration"),
    performance_note_count: col("performance_note_count"),
    performance_duration: col("performance_duration"),
  };
}

async function main(): Promise<void> {
  const csvPath = await ensureMetadataCsv();
  console.log("Parsing metadata.csv ...");
  const text = await readFile(csvPath, "utf-8");

  let idx: ColumnIndex | null = null;
  const splitCounters: Record<string, number> = {};
  const best = new Map<string, Candidate>();
  let rowCount = 0;

  parseCsvRows(text, (cells) => {
    if (!idx) {
      idx = resolveColumns(cells);
      return;
    }
    rowCount++;
    const row: MetaRow = {
      composer: cells[idx.composer],
      composition: cells[idx.composition],
      movement: cells[idx.movement],
      split: cells[idx.split],
      tier_a: cells[idx.tier_a],
      tier_a_star: cells[idx.tier_a_star],
      quality_label: cells[idx.quality_label],
      score_note_count: cells[idx.score_note_count],
      score_duration: cells[idx.score_duration],
      performance_note_count: cells[idx.performance_note_count],
      performance_duration: cells[idx.performance_duration],
    };
    const offset = splitCounters[row.split] ?? 0;
    splitCounters[row.split] = offset + 1;

    const key = `${row.composer} ${row.composition} ${row.movement}`;
    const score = representativeScore(row);
    const existing = best.get(key);
    if (!existing || score > existing.score) {
      best.set(key, { row, offset, score });
    }
  });
  console.log(`Parsed ${rowCount} rows -> ${best.size} unique pieces`);

  const entries: Prisma.ArchiveEntryCreateManyInput[] = [];
  for (const { row, offset } of best.values()) {
    const durationSec = parseFloat(row.score_duration || row.performance_duration || "0") || 0;
    const noteCount = Math.round(parseFloat(row.score_note_count || row.performance_note_count || "0")) || 0;
    // Placeholder heuristic (note density only -- metadata.csv has no note
    // timing/overlap data to compute real polyphony). Recomputed properly
    // via extractSongMetadata() at import time once the actual MIDI bytes
    // are fetched (Task 5).
    const notesPerSec = durationSec > 0 ? noteCount / durationSec : 0;
    const difficulty = Math.max(1, Math.min(5, Math.round(0.75 + notesPerSec * 0.45)));
    const title = row.movement
      ? `${row.composition.replace(/_/g, " ")} -- ${row.movement.replace(/_/g, " ")}`
      : row.composition.replace(/_/g, " ");
    entries.push({
      title,
      composer: row.composer.replace(/_/g, " "),
      duration_sec: durationSec,
      note_count: noteCount,
      difficulty,
      source_ref: `${row.split}:${offset}`,
    });
  }

  const prisma = new PrismaClient();
  try {
    console.log("Clearing existing ArchiveEntry rows ...");
    await prisma.archiveEntry.deleteMany();
    console.log(`Inserting ${entries.length} ArchiveEntry rows ...`);
    const BATCH = 1000;
    for (let i = 0; i < entries.length; i += BATCH) {
      await prisma.archiveEntry.createMany({ data: entries.slice(i, i + BATCH) });
      console.log(`  ${Math.min(i + BATCH, entries.length)}/${entries.length}`);
    }
    const total = await prisma.archiveEntry.count();
    console.log(`Done. ArchiveEntry now has ${total} rows.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
