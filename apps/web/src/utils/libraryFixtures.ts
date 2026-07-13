import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Real MIDI files from the song library, used as test fixtures so the beat-grid and
 * excerpt logic is proven against genuine data rather than only synthetic examples.
 *
 * The library is volume-mounted and GITIGNORED, so it does not exist on a clean
 * checkout. Suites that depend on it must skip rather than fail.
 *
 * Two false starts, both of which shipped a red CI:
 *  - existsSync(dir) alone: CI had the directory but no files -> guard passed, tests
 *    then died on ENOENT.
 *  - "does the dir contain ANY .mid file": apps/api's own upload tests WRITE real .mid
 *    files into this very directory (they don't mock the filesystem), so by the time
 *    the web suite runs the dir is non-empty -> guard passed again, same ENOENT.
 *
 * So probe for a SPECIFIC seeded fixture that only the real library provides.
 */
export const MIDI_LIBRARY_DIR = path.resolve(__dirname, "../../../api/data/midi-library");

const PROBE = "abba-dancing-queen.mid";

export const hasLibraryFixtures = (): boolean => existsSync(path.join(MIDI_LIBRARY_DIR, PROBE));
