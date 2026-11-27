import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { STORAGE_KEY_INVENTORY } from "./storageKeys";

/**
 * The key inventory test (docs/specs/MUSIC-PORTAL.md, 1.3 rule 3). It finds every storage
 * key in the web app's source and compares the set with STORAGE_KEY_INVENTORY. Dropping a
 * key that installs still hold, or adding one, fails here until storageKeys.ts is updated
 * on purpose.
 */

const src = dirname(dirname(fileURLToPath(import.meta.url)));
const webRoot = dirname(src);
const repoRoot = dirname(dirname(webRoot));
// Workspace packages the app hands `localStorage` to (they own some keys too).
const packageSources = readdirSync(join(repoRoot, "packages"))
  .map((name) => join(repoRoot, "packages", name, "src"))
  .filter((dir) => {
    try {
      return statSync(dir).isDirectory();
    } catch {
      return false;
    }
  });

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "node_modules" ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const KEY_PREFIX = "(?:ks|keyboard-sensei|mp)-";
const PATTERNS: { kind: "exact" | "prefix"; regex: RegExp }[] = [
  // localStorage.getItem("ks-x"), setItem("ks-x", ...), removeItem("ks-x")
  { kind: "exact", regex: new RegExp(`(?:get|set|remove)Item\\(\\s*["'](${KEY_PREFIX}[^"']+)["']`, "g") },
  // const SOME_KEY = "ks-x" / const KEY = "ks-x" / const SOME_PREFIX = "ks-x:" / const SOME_DB_NAME = "mp-x"
  { kind: "exact", regex: new RegExp(`\\b[A-Z_]*(?:KEY|PREFIX|DB_NAME)[A-Z_]*\\s*=\\s*["'](${KEY_PREFIX}[^"']+)["']`, "g") },
  // `ks-family:${id}`
  { kind: "prefix", regex: new RegExp(`\`(${KEY_PREFIX}[a-z0-9-]*:)\\$\\{`, "g") },
];

function discoveredKeys(): Map<string, Set<string>> {
  const found = new Map<string, Set<string>>();
  const files = [...sourceFiles(src), ...packageSources.flatMap(sourceFiles), join(webRoot, "index.html")];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const { regex } of PATTERNS) {
      for (const match of text.matchAll(regex)) {
        const key = match[1];
        found.set(key, (found.get(key) ?? new Set()).add(relative(repoRoot, file)));
      }
    }
  }
  return found;
}

describe("storage key inventory", () => {
  const found = discoveredKeys();
  const inventory = new Set(STORAGE_KEY_INVENTORY.map((entry) => entry.key));

  it("lists every key the source uses", () => {
    const unlisted = [...found.keys()].filter((key) => !inventory.has(key));
    expect(unlisted, "New storage keys must be added to state/storageKeys.ts (and use the mp- prefix)").toEqual([]);
  });

  it("still finds every listed key in the source (no key was dropped)", () => {
    const missing = [...inventory].filter((key) => !found.has(key));
    expect(
      missing,
      "These keys are in the inventory but no longer in the source. Installs still hold them: keep reading them, or copy them forward in a storage migration, and only then update state/storageKeys.ts",
    ).toEqual([]);
  });

  it("has no duplicates, uses ':' to end every prefix, and gives new keys the mp- prefix", () => {
    expect(inventory.size).toBe(STORAGE_KEY_INVENTORY.length);
    for (const entry of STORAGE_KEY_INVENTORY) {
      expect(entry.key.endsWith(":"), entry.key).toBe(entry.kind === "prefix");
      expect(entry.key).toMatch(/^(ks-|keyboard-sensei-|mp-)/);
    }
  });

  it("keeps the keys existing installs hold, under their exact names", () => {
    for (const key of [
      "ks-audio-latency-ms",
      "ks-playalong-settings",
      "ks-experience",
      "ks-appearance",
      "keyboard-sensei-access-token",
      "keyboard-sensei-instrument-id",
      "keyboard-sensei-note-reading-config",
      "keyboard-sensei-crash-reporting",
    ]) {
      expect(inventory.has(key), key).toBe(true);
    }
  });
});
