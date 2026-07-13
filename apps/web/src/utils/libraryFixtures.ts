import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * Real MIDI files from the song library, used as test fixtures so the beat-grid and
 * excerpt logic is proven against genuine data rather than only synthetic examples.
 *
 * The library is volume-mounted and GITIGNORED, so it does not exist on a clean
 * checkout. Suites that depend on it must skip rather than fail.
 *
 * NOTE: check for actual .mid FILES, not just the directory. CI had the directory
 * present but empty, so an existsSync(dir) guard passed and every test then died on
 * ENOENT — the guard has to prove the fixtures are really there.
 */
export const MIDI_LIBRARY_DIR = path.resolve(__dirname, "../../../api/data/midi-library");

export function hasLibraryFixtures(): boolean {
  try {
    if (!existsSync(MIDI_LIBRARY_DIR)) return false;
    return readdirSync(MIDI_LIBRARY_DIR).some((f) => f.endsWith(".mid"));
  } catch {
    return false;
  }
}
