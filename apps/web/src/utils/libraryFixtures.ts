import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Real MIDI files from the song library, used as test fixtures so the beat-grid
 * and excerpt logic is proven against genuine data rather than only synthetic
 * examples.
 *
 * The library is volume-mounted and GITIGNORED (see .gitignore), so it does not
 * exist in CI. Suites that depend on it must skip rather than fail — otherwise
 * `pnpm test` goes red on a clean checkout for reasons that have nothing to do
 * with the code.
 */
export const MIDI_LIBRARY_DIR = path.resolve(__dirname, "../../../api/data/midi-library");

export const hasLibraryFixtures = (): boolean => existsSync(MIDI_LIBRARY_DIR);
