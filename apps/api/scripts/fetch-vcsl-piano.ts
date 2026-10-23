/**
 * Build the "Studio Grand" sample instrument from the Versilian Community Sample
 * Library (VCSL).
 *
 * Source: github.com/sgossner/VCSL, "Grand Piano, Steinway B" (close microphones,
 * undamped "NoSus" notes plus the damper-release recordings).
 * Licence: CC0 1.0 (public domain). Credit is still given on the licences page.
 *
 * Usage:
 *   pnpm --filter @keyboard-sensei/api exec tsx scripts/fetch-vcsl-piano.ts
 *   pnpm --filter @keyboard-sensei/api exec tsx scripts/fetch-vcsl-piano.ts --pin
 *
 * Every source file is downloaded from a pinned commit and checked against the
 * sha256 recorded in scripts/vcsl-piano-pins.json before it is used; `--pin`
 * (re)writes that file from what was downloaded and is only for deliberately
 * changing the subset. The source is about 600 MB of 24-bit WAV, so each file is
 * downloaded, encoded and deleted in turn; only the encoded pack is kept.
 *
 * The pack keeps the sampler small and lazy:
 *   - three touch (velocity) layers, every whole-tone root (42 notes, so a played
 *     key is never pitch-shifted by more than a semitone, except above G#7);
 *   - each note trimmed to a length that suits its pitch, with a fade-out;
 *   - mono MP3 (plays everywhere, including Safari and headless Chromium). Mono because the decoded
 *     samples sit in memory as 32-bit float: stereo would be about twice the memory for a stereo image
 *     that a pitch-shifted, layered sampler can't keep faithful anyway;
 *   - one set of damper-release recordings for the notes that have dampers.
 *
 * Output: data/instruments/vcsl_steinway_b/ (gitignored) and
 * scripts/vcsl-piano-manifest.json (gitignored), which prisma/seed.ts reads.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PACK_ID = "vcsl_steinway_b";
const PACK_DIR = path.resolve(SCRIPT_DIR, "../data/instruments", PACK_ID);
const MANIFEST_PATH = path.resolve(SCRIPT_DIR, "vcsl-piano-manifest.json");
const PINS_PATH = path.resolve(SCRIPT_DIR, "vcsl-piano-pins.json");

const COMMIT = "c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e";
const REPO_RAW = `https://raw.githubusercontent.com/sgossner/VCSL/${COMMIT}`;
const PIANO_DIR = "Chordophones/Zithers/Grand Piano, Steinway B";
const SOURCE_PAGE = `https://github.com/sgossner/VCSL/tree/${COMMIT}/${encodeURI(PIANO_DIR)}`;

/** The source has these roots: C, D, E, F#, G#, A# in every octave. */
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const SUSTAIN_ROOTS = [22, ...range(24, 104, 2).filter((midi) => [0, 2, 4, 6, 8, 10].includes(midi % 12))];
const RELEASE_ROOT_LIMIT_MIDI = 80;

/** Touch layers in the source: vl2 (soft) to vl4 (hard). */
const LAYERS = [
  { key: "v2", source: "vl2", maxVelocity: 52 },
  { key: "v3", source: "vl3", maxVelocity: 92 },
  { key: "v4", source: "vl4", maxVelocity: 127 },
] as const;
const RELEASE_SOURCE_LAYER = "vl3";

/** Length of the kept note, by pitch: long bass strings, short treble. */
const noteSeconds = (midi: number): number => Math.round((7.5 - ((midi - 21) / 87) * 4.5) * 10) / 10;
const FADE_OUT_S = 1.0;
const RELEASE_SECONDS = 0.9;
const RELEASE_FADE_S = 0.3;
/** Loudness is measured over the first second, where a piano note is loudest. */
const RMS_WINDOW_S = 1;
const SAMPLE_RATE = 44_100;
const MP3_BITRATE = "64k";
const RELEASE_BITRATE = "40k";
const DOWNLOAD_CONCURRENCY = 4;

function range(from: number, to: number, step: number): number[] {
  const values: number[] = [];
  for (let value = from; value <= to; value += step) values.push(value);
  return values;
}

/** midi 22 -> "A#0"; the source file names spell sharps with "#". */
const sourceNoteName = (midi: number): string => `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;

interface Pins {
  commit: string;
  files: Record<string, string>;
}

interface Job {
  /** Path inside the VCSL repository. */
  repoPath: string;
  /** Key in layout.json, and the output file stem. */
  key: string;
  midi: number;
  seconds: number;
  fadeS: number;
  bitrate: string;
  kind: "sustain" | "release";
  layerKey: string;
}

function buildJobs(): Job[] {
  const jobs: Job[] = [];
  for (const layer of LAYERS) {
    for (const midi of SUSTAIN_ROOTS) {
      jobs.push({
        repoPath: `${PIANO_DIR}/NoSus/JHPiano_NoSus_Close_${sourceNoteName(midi)}_${layer.source}_rr1.wav`,
        key: `${layer.key}_${midi}`,
        midi,
        seconds: noteSeconds(midi),
        fadeS: FADE_OUT_S,
        bitrate: MP3_BITRATE,
        kind: "sustain",
        layerKey: layer.key,
      });
    }
  }
  for (const midi of SUSTAIN_ROOTS.filter((root) => root <= RELEASE_ROOT_LIMIT_MIDI)) {
    jobs.push({
      repoPath: `${PIANO_DIR}/Rel/JHPiano_NoSusRel_Close_${sourceNoteName(midi)}_${RELEASE_SOURCE_LAYER}_rr1.wav`,
      key: `r_${midi}`,
      midi,
      seconds: RELEASE_SECONDS,
      fadeS: RELEASE_FADE_S,
      bitrate: RELEASE_BITRATE,
      kind: "release",
      layerKey: "r",
    });
  }
  return jobs;
}

const sha256 = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");

async function download(repoPath: string): Promise<Buffer> {
  const url = `${REPO_RAW}/${repoPath.split("/").map(encodeURIComponent).join("/")}`;
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      if (attempt >= 4) throw new Error(`${repoPath}: ${error instanceof Error ? error.message : String(error)}`);
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
}

function run(command: string, args: string[], input?: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => err.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(Buffer.concat(out));
      else reject(new Error(`${command} exited ${code}: ${Buffer.concat(err).toString().slice(-400)}`));
    });
    child.stdin.on("error", () => undefined);
    child.stdin.end(input);
  });
}

/** Trim, fade out, and resample to 44.1 kHz mono float PCM (raw f32le). */
const trimFilter = (job: Job): string =>
  `atrim=0:${job.seconds},afade=t=out:st=${Math.max(0, job.seconds - job.fadeS)}:d=${job.fadeS}`;

async function decodeTrimmed(wav: Buffer, job: Job): Promise<Buffer> {
  return run(
    "ffmpeg",
    ["-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-af", trimFilter(job), "-ar", String(SAMPLE_RATE), "-ac", "1", "-f", "f32le", "pipe:1"],
    wav,
  );
}

async function encodeMp3(pcm: Buffer, job: Job): Promise<Buffer> {
  return run(
    "ffmpeg",
    [
      "-hide_banner", "-loglevel", "error",
      "-f", "f32le", "-ar", String(SAMPLE_RATE), "-ac", "1", "-i", "pipe:0",
      "-c:a", "libmp3lame", "-b:a", job.bitrate, "-write_xing", "1",
      "-f", "mp3", "pipe:1",
    ],
    pcm,
  );
}

/** RMS of the first second of mono float PCM. */
function openingRms(pcm: Buffer): number {
  const floats = new Float32Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.byteLength / 4));
  const count = Math.min(floats.length, RMS_WINDOW_S * SAMPLE_RATE);
  let sum = 0;
  for (let i = 0; i < count; i++) sum += floats[i] * floats[i];
  return Math.sqrt(sum / Math.max(1, count));
}

async function loadPins(): Promise<Pins | null> {
  try {
    return JSON.parse(await readFile(PINS_PATH, "utf8")) as Pins;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const pinMode = process.argv.includes("--pin");
  const existingPins = await loadPins();
  if (!pinMode && !existingPins) throw new Error(`${PINS_PATH} is missing. Run once with --pin to record the source checksums.`);
  if (existingPins && existingPins.commit !== COMMIT) throw new Error("Pins were recorded for a different VCSL commit; run with --pin.");

  const jobs = buildJobs();
  const pins: Pins = { commit: COMMIT, files: pinMode ? {} : { ...existingPins!.files } };
  const tmpDir = `${PACK_DIR}.tmp-${process.pid}-${Date.now()}`;
  await rm(tmpDir, { recursive: true, force: true });
  await mkdir(tmpDir, { recursive: true });

  const layerRms = new Map<string, number[]>();
  const files: Record<string, { file: string; contentType: string }> = {};
  let cursor = 0;
  let done = 0;
  try {
    const worker = async () => {
      while (cursor < jobs.length) {
        const job = jobs[cursor++];
        const wav = await download(job.repoPath);
        const digest = sha256(wav);
        if (pinMode) pins.files[job.repoPath] = digest;
        else if (pins.files[job.repoPath] !== digest) throw new Error(`Checksum mismatch for ${job.repoPath}`);
        const pcm = await decodeTrimmed(wav, job);
        if (job.kind === "sustain") {
          const list = layerRms.get(job.layerKey) ?? [];
          list.push(openingRms(pcm));
          layerRms.set(job.layerKey, list);
        }
        const mp3 = await encodeMp3(pcm, job);
        const file = `${job.key}.mp3`;
        await writeFile(path.join(tmpDir, file), mp3);
        files[job.key] = { file, contentType: "audio/mpeg" };
        done += 1;
        if (done % 10 === 0 || done === jobs.length) console.log(`${done}/${jobs.length} samples`);
      }
    };
    await Promise.all(Array.from({ length: DOWNLOAD_CONCURRENCY }, worker));

    // Loudness trim per layer: the quietest-sounding layer plays at gain 1, louder ones are brought
    // down to it, so the velocity curve in the player alone decides how loud a touch is.
    const meanRms = new Map([...layerRms].map(([key, values]) => [key, values.reduce((a, b) => a + b, 0) / values.length]));
    const quietest = Math.min(...meanRms.values());
    const sampler = {
      engine: "layered-piano",
      version: 1,
      layers: LAYERS.map((layer) => ({
        key: layer.key,
        maxVelocity: layer.maxVelocity,
        trim: Number((quietest / meanRms.get(layer.key)!).toFixed(4)),
        roots: SUSTAIN_ROOTS,
      })),
      release: { key: "r", roots: SUSTAIN_ROOTS.filter((root) => root <= RELEASE_ROOT_LIMIT_MIDI), seconds: RELEASE_SECONDS },
    };
    const sortedFiles = Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b, "en", { numeric: true })));
    await writeFile(path.join(tmpDir, "layout.json"), JSON.stringify({ type: "notes", notes: sortedFiles, sampler }, null, 2));

    await mkdir(path.dirname(PACK_DIR), { recursive: true });
    await rm(PACK_DIR, { recursive: true, force: true });
    await rename(tmpDir, PACK_DIR);
  } catch (error) {
    await rm(tmpDir, { recursive: true, force: true });
    throw error;
  }

  if (pinMode) {
    const sorted = Object.fromEntries(Object.entries(pins.files).sort(([a], [b]) => a.localeCompare(b)));
    await writeFile(PINS_PATH, `${JSON.stringify({ commit: COMMIT, files: sorted }, null, 2)}\n`);
    console.log(`Wrote ${Object.keys(sorted).length} checksums to ${PINS_PATH}`);
  }

  let totalBytes = 0;
  for (const { file } of Object.values(files)) totalBytes += (await stat(path.join(PACK_DIR, file))).size;
  console.log(`Pack: ${Object.keys(files).length} files, ${(totalBytes / 1e6).toFixed(1)} MB in ${PACK_DIR}`);

  const manifest = [
    {
      id: PACK_ID,
      name: "Studio Grand",
      description: "Studio Grand — a recorded Steinway B with soft, medium and hard touch and damper release (about 5 MB, loads on first use)",
      category: "piano",
      rights: "CC0-1.0 Versilian Community Sample Library (VCSL), Grand Piano Steinway B",
      sourceUrl: SOURCE_PAGE,
      packDir: PACK_ID,
    },
  ];
  await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Wrote ${MANIFEST_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
