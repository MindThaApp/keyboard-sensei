/**
 * Build the curated play-along MIDI library.
 *
 * Source: the ADL Piano MIDI dataset (github.com/lucasnfe/adl-piano-midi), a
 * research dataset of ~11k piano MIDI files organized Genre/Artist/Title.
 * (piano-midi.de was the planned source but blocks non-browser clients.)
 *
 * Usage:
 *   pnpm exec tsx scripts/fetch-midi-library.ts [--source <extracted-adl-dir>]
 *
 * Without --source, downloads and extracts the dataset zip to a temp dir.
 * Selects the curated roster below, validates every file with the same rules
 * as the upload endpoint, copies accepted files into data/midi-library/, and
 * writes scripts/midi-manifest.json for the seed to consume.
 * Exits nonzero if fewer than 150 files validate.
 */
import { execFileSync } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, readdir, readFile, writeFile, copyFile, stat, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { extractSongMetadata, InvalidMidiError } from "../src/midi-metadata.js";

const ZIP_URL = "https://raw.githubusercontent.com/lucasnfe/adl-piano-midi/master/midi/adl-piano-midi.zip";
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const LIBRARY_DIR = path.resolve(SCRIPT_DIR, "../data/midi-library");
const MANIFEST_PATH = path.resolve(SCRIPT_DIR, "midi-manifest.json");
const MIN_ACCEPTED = 150;

interface CurationSource {
  /** Directory inside the dataset, relative to the adl-piano-midi root. */
  dir: string;
  /** Artist/composer label to store. */
  artist: string;
  genre: "classical" | "pop" | "film" | "game" | "jazz" | "other";
  rights: "public-domain" | "cover-arrangement";
  /** Max files to take from this folder (after validation), by filename sort. */
  cap: number;
  /** Skip filenames matching (case-insensitive). */
  exclude?: RegExp;
}

// Anything orchestral-transcription-ish is still fine: everything in the
// dataset is a piano rendition. Excludes trim obvious non-piano-rep titles.
const SOURCES: CurationSource[] = [
  // --- Classical (public-domain compositions) ---
  { dir: "Classical/Classical/Ludwig van Beethoven", artist: "Ludwig van Beethoven", genre: "classical", rights: "public-domain", cap: 24, exclude: /string quartet|symphony no|5th symphony/i },
  { dir: "Classical/Classical/Frederic Chopin", artist: "Frédéric Chopin", genre: "classical", rights: "public-domain", cap: 30 },
  { dir: "Classical/Classical/Wolfgang Amadeus Mozart", artist: "Wolfgang Amadeus Mozart", genre: "classical", rights: "public-domain", cap: 18, exclude: /string quartet|requiem/i },
  { dir: "Classical/Classical/Johann Sebastian Bach", artist: "Johann Sebastian Bach", genre: "classical", rights: "public-domain", cap: 24, exclude: /cello|violin|partita bwv 100[1-6]/i },
  { dir: "Classical/Classical/Claude Debussy", artist: "Claude Debussy", genre: "classical", rights: "public-domain", cap: 9 },
  { dir: "Classical/Classical/Erik Satie", artist: "Erik Satie", genre: "classical", rights: "public-domain", cap: 4 },
  { dir: "Classical/Classical/Franz Liszt", artist: "Franz Liszt", genre: "classical", rights: "public-domain", cap: 7 },
  { dir: "Classical/Classical/Pyotr Ilyich Tchaikovsky", artist: "Pyotr Ilyich Tchaikovsky", genre: "classical", rights: "public-domain", cap: 14 },
  { dir: "Classical/Classical/Tchaikovsky", artist: "Pyotr Ilyich Tchaikovsky", genre: "classical", rights: "public-domain", cap: 3 },
  { dir: "Classical/Classical/Franz Schubert", artist: "Franz Schubert", genre: "classical", rights: "public-domain", cap: 10 },
  { dir: "Classical/Classical/Johannes Brahms", artist: "Johannes Brahms", genre: "classical", rights: "public-domain", cap: 8 },
  { dir: "Classical/Classical/Felix Mendelssohn", artist: "Felix Mendelssohn", genre: "classical", rights: "public-domain", cap: 8 },
  { dir: "Classical/Classical/Robert Schumann", artist: "Robert Schumann", genre: "classical", rights: "public-domain", cap: 8 },
  { dir: "Classical/Classical/Sergei Rachmaninoff", artist: "Sergei Rachmaninoff", genre: "classical", rights: "public-domain", cap: 8 },
  { dir: "Classical/Classical/Johann Pachelbel", artist: "Johann Pachelbel", genre: "classical", rights: "public-domain", cap: 4 },
  { dir: "Classical/Classical/George Frideric Handel", artist: "George Frideric Handel", genre: "classical", rights: "public-domain", cap: 6 },
  { dir: "Classical/Classical/Antonio Vivaldi", artist: "Antonio Vivaldi", genre: "classical", rights: "public-domain", cap: 5 },
  { dir: "Classical/Classical Era/Muzio Clementi", artist: "Muzio Clementi", genre: "classical", rights: "public-domain", cap: 6 },
  { dir: "Classical/Classical/Domenico Scarlatti", artist: "Domenico Scarlatti", genre: "classical", rights: "public-domain", cap: 5 },
  { dir: "Classical/Late Romantic Era/Modest Mussorgsky", artist: "Modest Mussorgsky", genre: "classical", rights: "public-domain", cap: 4 },
  { dir: "Unknown/Unknown/Edvard Hagerup Grieg", artist: "Edvard Grieg", genre: "classical", rights: "public-domain", cap: 6 },
  { dir: "Classical/Classical/Dvorak", artist: "Antonín Dvořák", genre: "classical", rights: "public-domain", cap: 4 },
  // Ragtime — public domain and instantly recognisable (The Entertainer…).
  { dir: "Blues/Ragtime/Scott Joplin", artist: "Scott Joplin", genre: "jazz", rights: "public-domain", cap: 8 },

  // --- Pop / rock piano covers (compositions copyrighted; private use) ---
  { dir: "Rock/Psychedelic Rock/Beatles", artist: "The Beatles", genre: "pop", rights: "cover-arrangement", cap: 10 },
  { dir: "Rock/Glam Rock/Elton John", artist: "Elton John", genre: "pop", rights: "cover-arrangement", cap: 8 },
  { dir: "Rock/Glam Rock/Queen", artist: "Queen", genre: "pop", rights: "cover-arrangement", cap: 8 },
  { dir: "Rock/Album Rock/Billy Joel", artist: "Billy Joel", genre: "pop", rights: "cover-arrangement", cap: 6 },
  { dir: "Rock/Permanent Wave/Coldplay", artist: "Coldplay", genre: "pop", rights: "cover-arrangement", cap: 6 },
  { dir: "World/Swedish Pop/Abba", artist: "ABBA", genre: "pop", rights: "cover-arrangement", cap: 6 },
  { dir: "Soul/Soul/Michael Jackson", artist: "Michael Jackson", genre: "pop", rights: "cover-arrangement", cap: 5 },
  { dir: "Soul/Soul/Stevie Wonder", artist: "Stevie Wonder", genre: "pop", rights: "cover-arrangement", cap: 4 },
  { dir: "Rock/Folk Rock/Simon And Garfunkel", artist: "Simon & Garfunkel", genre: "pop", rights: "cover-arrangement", cap: 4 },
  { dir: "Rock/Album Rock/Eagles", artist: "Eagles", genre: "pop", rights: "cover-arrangement", cap: 3 },
  { dir: "Rock/Album Rock/Led Zeppelin", artist: "Led Zeppelin", genre: "pop", rights: "cover-arrangement", cap: 3 },
  { dir: "Rock/Album Rock/Pink Floyd", artist: "Pink Floyd", genre: "pop", rights: "cover-arrangement", cap: 3 },
  { dir: "Rock/Rock-And-Roll/Elvis Presley", artist: "Elvis Presley", genre: "pop", rights: "cover-arrangement", cap: 4 },
  { dir: "Ambient/Lounge/Frank Sinatra", artist: "Frank Sinatra", genre: "pop", rights: "cover-arrangement", cap: 3 },

  // --- Film / stage ---
  { dir: "Soundtracks/Disney/Alan Menken", artist: "Alan Menken (Disney)", genre: "film", rights: "cover-arrangement", cap: 8 },
  { dir: "Soundtracks/Disney/Randy Newman", artist: "Randy Newman (Disney/Pixar)", genre: "film", rights: "cover-arrangement", cap: 3 },
  { dir: "Soundtracks/French Soundtrack/Yann Tiersen", artist: "Yann Tiersen", genre: "film", rights: "cover-arrangement", cap: 3 },
  { dir: "Rock/Cyberpunk/Vangelis", artist: "Vangelis", genre: "film", rights: "cover-arrangement", cap: 3 },
  { dir: "Classical/Neo-Classical/Ludovico Einaudi", artist: "Ludovico Einaudi", genre: "film", rights: "cover-arrangement", cap: 6 },
];

interface ManifestEntry {
  id: string;
  title: string;
  artist: string;
  genre: string;
  rights: string;
  source: string;
  sourcePath: string;
  file: string;
  durationSec: number;
  noteCount: number;
  difficulty: number;
}

const slugify = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

const cleanTitle = (filename: string): string =>
  filename
    .replace(/\.mid$/i, "")
    .replace(/\s*\((1 ?hand|as made famous by[^)]*|[^)]*(live|remaster|bootleg|album version|single version)[^)]*)\)\s*/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Marquee pieces whose primary copy failed validation — hand-picked alternates. */
const EXTRA_FILES: { path: string; title: string; artist: string; genre: CurationSource["genre"]; rights: CurationSource["rights"] }[] = [
  { path: "Unknown/Unknown/John Novacek/Debussy Clair de lune.mid", title: "Clair de Lune", artist: "Claude Debussy", genre: "classical", rights: "public-domain" },
];

async function ensureDataset(sourceArg: string | undefined): Promise<string> {
  if (sourceArg) return sourceArg;
  const workDir = path.join(tmpdir(), "ks-adl-dataset");
  const root = path.join(workDir, "adl-piano-midi");
  if (await stat(root).then((s) => s.isDirectory()).catch(() => false)) {
    console.log(`Using cached dataset at ${root}`);
    return root;
  }
  await mkdir(workDir, { recursive: true });
  const zipPath = path.join(workDir, "adl.zip");
  console.log(`Downloading ${ZIP_URL} …`);
  const response = await fetch(ZIP_URL);
  if (!response.ok || !response.body) throw new Error(`Download failed: HTTP ${response.status}`);
  await pipeline(Readable.fromWeb(response.body as never), createWriteStream(zipPath));
  console.log("Extracting…");
  execFileSync("unzip", ["-oq", zipPath, "-d", workDir]);
  return root;
}

async function main(): Promise<void> {
  const sourceFlag = process.argv.indexOf("--source");
  const datasetRoot = await ensureDataset(sourceFlag === -1 ? undefined : process.argv[sourceFlag + 1]);
  await mkdir(LIBRARY_DIR, { recursive: true });
  // Remove previously fetched library files (keep user uploads: upload-*.mid).
  for (const existing of await readdir(LIBRARY_DIR)) {
    if (existing.endsWith(".mid") && !existing.startsWith("upload-")) {
      await unlink(path.join(LIBRARY_DIR, existing));
    }
  }

  const manifest: ManifestEntry[] = [];
  const seenIds = new Set<string>();
  const rejected: { file: string; reason: string }[] = [];

  const admit = async (sourcePath: string, relPath: string, entry: Omit<ManifestEntry, "file" | "sourcePath" | "durationSec" | "noteCount" | "difficulty">): Promise<boolean> => {
    if (seenIds.has(entry.id)) return false;
    try {
      const bytes = new Uint8Array(await readFile(sourcePath));
      const metadata = extractSongMetadata(bytes); // validates; metadata stored so seeding is parse-free
      const fileName = `${entry.id}.mid`;
      await copyFile(sourcePath, path.join(LIBRARY_DIR, fileName));
      manifest.push({ ...entry, sourcePath: relPath, file: fileName, ...metadata });
      seenIds.add(entry.id);
      return true;
    } catch (error) {
      rejected.push({
        file: relPath,
        reason: error instanceof InvalidMidiError ? error.message : `unexpected: ${String(error)}`,
      });
      return false;
    }
  };

  for (const source of SOURCES) {
    const dir = path.join(datasetRoot, source.dir);
    let files: string[];
    try {
      files = (await readdir(dir)).filter((name) => name.toLowerCase().endsWith(".mid")).sort();
    } catch {
      console.warn(`SKIP source (missing dir): ${source.dir}`);
      continue;
    }
    let taken = 0;
    for (const name of files) {
      if (taken >= source.cap) break;
      if (source.exclude?.test(name)) continue;
      const title = cleanTitle(name);
      const id = slugify(`${source.artist}-${title}`);
      if (!id) continue;
      const ok = await admit(path.join(dir, name), path.join(source.dir, name), {
        id,
        title,
        artist: source.artist,
        genre: source.genre,
        rights: source.rights,
        source: "adl-piano-midi",
      });
      if (ok) taken += 1;
    }
    console.log(`${source.dir}: took ${taken}/${Math.min(source.cap, files.length)} (${files.length} available)`);
  }

  for (const extra of EXTRA_FILES) {
    await admit(path.join(datasetRoot, extra.path), extra.path, {
      id: slugify(`${extra.artist}-${extra.title}`),
      title: extra.title,
      artist: extra.artist,
      genre: extra.genre,
      rights: extra.rights,
      source: "adl-piano-midi",
    });
  }

  await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`\nAccepted ${manifest.length} songs → ${LIBRARY_DIR}`);
  console.log(`Manifest → ${MANIFEST_PATH}`);
  if (rejected.length > 0) {
    console.log(`Rejected ${rejected.length}:`);
    for (const item of rejected.slice(0, 30)) console.log(`  ${item.file}: ${item.reason}`);
    if (rejected.length > 30) console.log(`  … and ${rejected.length - 30} more`);
  }
  const classical = manifest.filter((entry) => entry.rights === "public-domain").length;
  const covers = manifest.length - classical;
  console.log(`Public-domain: ${classical}, covers: ${covers}`);
  if (manifest.length < MIN_ACCEPTED) {
    console.error(`FAILED acceptance bar: ${manifest.length} < ${MIN_ACCEPTED}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
