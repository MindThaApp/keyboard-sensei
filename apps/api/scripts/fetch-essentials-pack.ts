/**
 * Fetch the Essentials pack's source MIDI files (see src/essentials/manifest.ts).
 *
 * Every Mutopia source is downloaded from its pinned URL and rejected unless
 * its sha256 matches the manifest, so the pack is reproducible. Zip sources
 * have their member extracted. Each file is validated (parses, plausible
 * duration, sane tempo and meter) and written to
 * data/midi-library/essentials/<slug>.source.mid.
 *
 * Run:  pnpm --filter @keyboard-sensei/api exec tsx scripts/fetch-essentials-pack.ts
 * Then: scripts/generate-essentials-pack.ts, then prisma/seed.ts.
 */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import ToneMidi from "@tonejs/midi";
import { ESSENTIALS_DIR, sourceFileName, unzipMember } from "../src/essentials/build.js";
import { AUTHORED_SCORES } from "../src/essentials/authored/index.js";
import { buildAuthoredMidi } from "../src/essentials/authored/notation.js";
import { ESSENTIALS, isAuthored } from "../src/essentials/manifest.js";
import { extractSongMetadata } from "../src/midi-metadata.js";

const { Midi } = ToneMidi;

async function download(url: string): Promise<Buffer> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
  throw new Error(`download failed: ${String(lastError)}`);
}

/** Tempo and meter sanity beyond what extractSongMetadata checks. */
function checkTimeline(bytes: Buffer): string | null {
  const midi = new Midi(bytes);
  const tempos = midi.header.tempos;
  if (tempos.some((tempo) => tempo.bpm < 15 || tempo.bpm > 320)) return `implausible tempo ${tempos.map((t) => t.bpm.toFixed(0)).join(",")}`;
  for (const event of midi.header.timeSignatures) {
    const [numerator, denominator] = event.timeSignature;
    if (!(numerator >= 1 && numerator <= 16) || ![1, 2, 4, 8, 16].includes(denominator)) return `odd meter ${numerator}/${denominator}`;
  }
  return null;
}

async function main(): Promise<void> {
  await mkdir(ESSENTIALS_DIR, { recursive: true });
  const cache = new Map<string, Buffer>();
  const failed: string[] = [];
  let fetched = 0;

  for (const piece of ESSENTIALS) {
    try {
      const { source } = piece;
      let bytes: Buffer;
      if (isAuthored(source)) {
        // Arranged in this repo: the "fetch" is writing its score out as MIDI.
        const score = AUTHORED_SCORES[piece.slug];
        if (!score) throw new Error("no authored score");
        bytes = buildAuthoredMidi(score);
      } else {
        let raw = cache.get(source.url);
        if (!raw) {
          raw = await download(source.url);
          cache.set(source.url, raw);
        }
        const sha256 = createHash("sha256").update(raw).digest("hex");
        if (sha256 !== source.sha256) throw new Error(`sha256 mismatch (got ${sha256}) — the upstream file changed`);
        bytes = source.member ? unzipMember(raw, source.member) : raw;
      }
      const meta = extractSongMetadata(new Uint8Array(bytes)); // throws InvalidMidiError
      const timelineProblem = checkTimeline(bytes);
      if (timelineProblem) throw new Error(timelineProblem);
      await writeFile(path.join(ESSENTIALS_DIR, sourceFileName(piece.slug)), bytes);
      fetched++;
      console.log(`  ok  ${piece.slug.padEnd(32)} ${meta.noteCount} notes ${meta.durationSec.toFixed(0)}s  ${isAuthored(piece.source) ? "authored" : piece.source.licence}`);
    } catch (error) {
      failed.push(piece.slug);
      console.warn(`SKIP ${piece.slug}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log(`\nFetched ${fetched}/${ESSENTIALS.length} Essentials sources → ${ESSENTIALS_DIR}`);
  if (failed.length > 0) console.log(`Skipped: ${failed.join(", ")}`);
  if (fetched === 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
