/**
 * Build the curated sample instrument library from midi-js-soundfonts.
 *
 * Source: gleitz/midi-js-soundfonts, FluidR3_GM soundfont JS data-uri packs.
 * License: Creative Commons Attribution 3.0.
 *
 * Usage:
 *   pnpm --filter @keyboard-sensei/api exec tsx scripts/fetch-instrument-library.ts
 *
 * Downloads each instrument JS pack to a temp directory, extracts per-note audio
 * files into data/instruments/, and writes scripts/instrument-manifest.json for
 * the Prisma seed to consume. Failed downloads are logged and skipped; packs are
 * written temp-first then renamed.
 */
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const LIBRARY_DIR = path.resolve(SCRIPT_DIR, "../data/instruments");
const MANIFEST_PATH = path.resolve(SCRIPT_DIR, "instrument-manifest.json");
const BASE_URL = "https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM";
const RIGHTS = "CC-BY-3.0 midi-js-soundfonts FluidR3_GM";

interface InstrumentSource {
  id: string;
  name: string;
  description: string;
  category: "piano" | "keys" | "more";
}

interface ManifestEntry extends InstrumentSource {
  rights: string;
  sourceUrl: string;
  packDir: string;
  sampleFileLayout: { type: "notes"; notes: Record<string, { file: string; contentType: string }> };
}

const CORE: InstrumentSource[] = [
  { id: "acoustic_grand_piano", name: "Concert Grand", description: "Concert Grand — bright, full, the default concert sound", category: "piano" },
  { id: "bright_acoustic_piano", name: "Bright Upright", description: "Bright Upright — crisper attack, cuts through", category: "piano" },
  { id: "electric_grand_piano", name: "Electric Grand", description: "Electric Grand — amplified acoustic, 70s pop", category: "piano" },
  { id: "honkytonk_piano", name: "Honky-Tonk", description: "Honky-Tonk — detuned barroom piano", category: "piano" },
  { id: "electric_piano_1", name: "Rhodes", description: "Rhodes — bell-like electric piano, soul and jazz", category: "keys" },
  { id: "electric_piano_2", name: "Wurlitzer", description: "Wurlitzer — reedy, barking electric piano", category: "keys" },
  { id: "harpsichord", name: "Harpsichord", description: "Harpsichord — plucked, baroque", category: "keys" },
  { id: "celesta", name: "Celesta", description: "Celesta — music-box bells", category: "keys" },
];

const MORE_IDS = [
  "clavinet", "glockenspiel", "music_box", "vibraphone", "marimba", "xylophone", "tubular_bells", "dulcimer",
  "drawbar_organ", "percussive_organ", "rock_organ", "church_organ", "reed_organ", "accordion", "harmonica", "tango_accordion",
  "acoustic_guitar_nylon", "acoustic_guitar_steel", "electric_guitar_jazz", "electric_guitar_clean", "electric_guitar_muted", "overdriven_guitar", "distortion_guitar", "guitar_harmonics",
  "acoustic_bass", "electric_bass_finger", "electric_bass_pick", "fretless_bass", "slap_bass_1", "slap_bass_2", "synth_bass_1", "synth_bass_2",
  "violin", "viola", "cello", "contrabass", "tremolo_strings", "pizzicato_strings", "orchestral_harp", "timpani",
  "string_ensemble_1", "string_ensemble_2", "synth_strings_1", "synth_strings_2", "choir_aahs", "voice_oohs", "synth_choir", "orchestra_hit",
  "trumpet", "trombone", "tuba", "muted_trumpet", "french_horn", "brass_section", "synth_brass_1", "synth_brass_2",
  "soprano_sax", "alto_sax", "tenor_sax", "baritone_sax", "oboe", "english_horn", "bassoon", "clarinet",
  "piccolo", "flute", "recorder", "pan_flute", "blown_bottle", "shakuhachi", "whistle", "ocarina",
  "lead_1_square", "lead_2_sawtooth", "lead_3_calliope", "lead_4_chiff", "lead_5_charang", "lead_6_voice", "lead_7_fifths", "lead_8_bass__lead",
  "pad_1_new_age", "pad_2_warm", "pad_3_polysynth", "pad_4_choir", "pad_5_bowed", "pad_6_metallic", "pad_7_halo", "pad_8_sweep",
  "fx_1_rain", "fx_2_soundtrack", "fx_3_crystal", "fx_4_atmosphere", "fx_5_brightness", "fx_6_goblins", "fx_7_echoes", "fx_8_scifi",
  "sitar", "banjo", "shamisen", "koto", "kalimba", "bagpipe", "fiddle", "shanai",
  "tinkle_bell", "agogo", "steel_drums", "woodblock", "taiko_drum", "melodic_tom", "synth_drum", "reverse_cymbal",
  "guitar_fret_noise", "breath_noise", "seashore", "bird_tweet", "telephone_ring", "helicopter", "applause", "gunshot",
] as const;

const titleCase = (id: string): string => id.split("_").filter(Boolean).map((part) => part[0].toUpperCase() + part.slice(1)).join(" ");
const MORE: InstrumentSource[] = MORE_IDS.map((id) => ({ id, name: titleCase(id), description: `${titleCase(id)} — General MIDI sound`, category: "more" }));
const SOURCES = [...CORE, ...MORE];

const dataUriPattern = /["']?([A-G](?:#|b)?-?\d)["']?\s*:\s*["']data:audio\/([^;"']+);base64,([A-Za-z0-9+/=]+)["']/g;

async function fetchInstrument(source: InstrumentSource): Promise<ManifestEntry | null> {
  const url = `${BASE_URL}/${source.id}-mp3.js`;
  const finalDir = path.join(LIBRARY_DIR, source.id);
  const tmpDir = `${finalDir}.tmp-${process.pid}-${Date.now()}`;
  await rm(tmpDir, { recursive: true, force: true });
  await mkdir(tmpDir, { recursive: true });
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    const layout: ManifestEntry["sampleFileLayout"] = { type: "notes", notes: {} };
    let match: RegExpExecArray | null;
    while ((match = dataUriPattern.exec(text))) {
      const [, note, rawType, payload] = match;
      const type = rawType === "mp3" || rawType === "mpeg" ? "mpeg" : rawType;
      const file = `${note.replace("#", "s").replace("b", "f")}.${type === "mpeg" ? "mp3" : type}`;
      await writeFile(path.join(tmpDir, file), Buffer.from(payload, "base64"));
      layout.notes[note] = { file, contentType: `audio/${type}` };
    }
    if (Object.keys(layout.notes).length === 0) throw new Error("No note samples found");
    await writeFile(path.join(tmpDir, "layout.json"), JSON.stringify(layout, null, 2));
    await rm(finalDir, { recursive: true, force: true });
    await rename(tmpDir, finalDir);
    console.log(`${source.id}: ${Object.keys(layout.notes).length} samples`);
    return { ...source, rights: RIGHTS, sourceUrl: url, packDir: source.id, sampleFileLayout: layout };
  } catch (error) {
    await rm(tmpDir, { recursive: true, force: true });
    console.warn(`SKIP ${source.id}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

async function main(): Promise<void> {
  await mkdir(LIBRARY_DIR, { recursive: true });
  const manifest: ManifestEntry[] = [];
  for (const source of SOURCES) {
    const entry = await fetchInstrument(source);
    if (entry) manifest.push(entry);
  }
  await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Wrote ${manifest.length} instruments to ${MANIFEST_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
