import { describe, expect, it } from "vitest";
import { OFFLINE_DB_NAME } from "../offline/kvStore";
import { STORAGE_KEY_INVENTORY } from "./storageKeys";
import {
  LATEST_STORAGE_VERSION,
  STORAGE_MIGRATIONS,
  STORAGE_VERSION_KEY,
  assertMigrationOrder,
  copyOnly,
  readStorageVersion,
  runStorageMigrations,
  type StorageMigration,
} from "./storageMigrations";

/** A Storage that refuses deletes, so a migration that tries one fails the test. */
class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  removals: string[] = [];
  constructor(initial: Record<string, string> = {}) {
    for (const [key, value] of Object.entries(initial)) this.data.set(key, value);
  }
  get length() {
    return this.data.size;
  }
  key(index: number) {
    return [...this.data.keys()][index] ?? null;
  }
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, String(value));
  }
  removeItem(key: string) {
    this.removals.push(key);
    throw new Error(`migration tried to remove ${key}`);
  }
  clear() {
    throw new Error("migration tried to clear storage");
  }
  snapshot() {
    return Object.fromEntries(this.data);
  }
}

/** Every key a current install can hold, with realistic values (prefix families with one example each). */
const CURRENT_INSTALL: Record<string, string> = {
  "keyboard-sensei-access-token": "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2lnbmF0dXJl",
  "keyboard-sensei-crash-reporting": "never",
  "ks-experience": "full",
  "ks-experience-pending": "1",
  "ks-appearance": JSON.stringify({ v: 1, theme: "dark", glass: "frosted", blur: 40, tint: "ocean", sheen: "subtle", density: "auto" }),
  "keyboard-sensei-theme": "midnight",
  "keyboard-sensei-accent-theme": "ocean",
  "ks-audio-latency-ms": "137",
  "keyboard-sensei-instrument-id": "upright-piano-k",
  "ks-monitor-keys": "on",
  "keyboard-sensei-range:usb:Digital Piano": JSON.stringify({ low: 21, high: 108, preference: "auto" }),
  "keyboard-sensei-zoom-v2:practice": "1320",
  "ks-exercise-sheet-scale": "1.25",
  "ks-metronome-settings": JSON.stringify({ sound: "wood", volume: 0.6, accent: true }),
  "ks-highlight-enabled": "false",
  "keyboard-sensei-note-reading-config": JSON.stringify({ clef: "both", range: "staff", timed: true }),
  "ks-playalong-settings": JSON.stringify({ speed: 0.75, lookahead: 4, waitMode: true }),
  "ks-playalong-fx": JSON.stringify({ preset: "glow", body: 0.4 }),
  "ks-fx-debug": "stats",
  "ks-practice-song:song-123": JSON.stringify({ level: 2, bars: [1, 8] }),
  "ks-practice-song-choices:song-123": JSON.stringify({ hands: "right" }),
  // Music Portal keys (new, mp-)
  "mp-locale": "de-DE",
  "mp-active-instrument": "guitar",
  "mp-played-instruments": JSON.stringify(["piano", "guitar"]),
  "mp-instrument-pending": "1",
  "mp-instrument-prompt-done": "1",
  "mp-mic-calibration:usb-1": JSON.stringify({ deviceId: "usb-1", gateDb: -45, latencyMs: 30 }),
  "mp-mic-device": "usb-1",
  "mp-mic-explained": "1",
  "mp-tuner-settings": JSON.stringify({ a4Hz: 442, customTunings: [] }),
  "mp-piano-tuning-session": JSON.stringify({ a4: 440, done: [60, 62] }),
  "mp-piano-check-reports": JSON.stringify([]),
};

/** Inventory entries that are not localStorage keys (IndexedDB database names). */
const NOT_LOCAL_STORAGE = new Set([OFFLINE_DB_NAME]);

describe("the current-install fixture", () => {
  it("covers every key in the inventory", () => {
    const keys = Object.keys(CURRENT_INSTALL);
    for (const entry of STORAGE_KEY_INVENTORY) {
      if (entry.key === STORAGE_VERSION_KEY) continue; // written by the migrations themselves
      if (NOT_LOCAL_STORAGE.has(entry.key)) continue;
      const covered = entry.kind === "exact" ? keys.includes(entry.key) : keys.some((key) => key.startsWith(entry.key));
      expect(covered, `fixture is missing ${entry.key}`).toBe(true);
    }
  });
});

describe("runStorageMigrations", () => {
  it("keeps every existing value, deletes nothing and records the version", () => {
    const storage = new MemoryStorage(CURRENT_INSTALL);
    const result = runStorageMigrations(storage);

    expect(result).toEqual({ from: 0, to: LATEST_STORAGE_VERSION, applied: STORAGE_MIGRATIONS.map((m) => m.version) });
    const after = storage.snapshot();
    for (const [key, value] of Object.entries(CURRENT_INSTALL)) expect(after[key], key).toBe(value);
    expect(storage.removals).toEqual([]);
    expect(after[STORAGE_VERSION_KEY]).toBe(String(LATEST_STORAGE_VERSION));
    // Only additions: every new key is an mp- key.
    for (const key of Object.keys(after)) {
      if (!(key in CURRENT_INSTALL)) expect(key).toMatch(/^mp-/);
    }
  });

  it("is a no-op when run again", () => {
    const storage = new MemoryStorage(CURRENT_INSTALL);
    runStorageMigrations(storage);
    const once = storage.snapshot();
    const again = runStorageMigrations(storage);
    expect(again).toEqual({ from: LATEST_STORAGE_VERSION, to: LATEST_STORAGE_VERSION, applied: [] });
    expect(storage.snapshot()).toEqual(once);
  });

  it("starts a fresh install at the latest version without inventing settings", () => {
    const storage = new MemoryStorage();
    runStorageMigrations(storage);
    expect(storage.snapshot()).toEqual({ [STORAGE_VERSION_KEY]: String(LATEST_STORAGE_VERSION) });
  });

  it("runs only the steps after the stored version, in order", () => {
    const ran: number[] = [];
    const steps: StorageMigration[] = [1, 2, 3].map((version) => ({ version, name: `step-${version}`, migrate: () => void ran.push(version) }));
    const storage = new MemoryStorage({ [STORAGE_VERSION_KEY]: "1" });
    expect(runStorageMigrations(storage, steps).applied).toEqual([2, 3]);
    expect(ran).toEqual([2, 3]);
    expect(readStorageVersion(storage)).toBe(3);
  });

  it("leaves a newer install alone (downgrade)", () => {
    const storage = new MemoryStorage({ ...CURRENT_INSTALL, [STORAGE_VERSION_KEY]: "99" });
    const before = storage.snapshot();
    expect(runStorageMigrations(storage).applied).toEqual([]);
    expect(storage.snapshot()).toEqual(before);
  });

  it("treats a damaged marker as version 0 and runs the (idempotent) steps", () => {
    const storage = new MemoryStorage({ ...CURRENT_INSTALL, [STORAGE_VERSION_KEY]: "abc" });
    expect(runStorageMigrations(storage).from).toBe(0);
    expect(readStorageVersion(storage)).toBe(LATEST_STORAGE_VERSION);
  });

  it("stops at a failing step, keeps the marker at the last good step and retries next time", () => {
    let fail = true;
    const steps: StorageMigration[] = [
      { version: 1, name: "ok", migrate: (s) => void s.setIfAbsent("mp-one", "1") },
      { version: 2, name: "flaky", migrate: () => { if (fail) throw new Error("boom"); } },
      { version: 3, name: "later", migrate: (s) => void s.setIfAbsent("mp-three", "3") },
    ];
    const storage = new MemoryStorage(CURRENT_INSTALL);
    const first = runStorageMigrations(storage, steps);
    expect(first).toEqual({ from: 0, to: 1, applied: [1], error: { version: 2, message: "boom" } });
    expect(storage.getItem("mp-three")).toBeNull();

    fail = false;
    expect(runStorageMigrations(storage, steps)).toEqual({ from: 1, to: 3, applied: [2, 3] });
    expect(storage.getItem("mp-three")).toBe("3");
  });

  it("refuses to delete: a step that tries fails and nothing is lost", () => {
    const steps: StorageMigration[] = [
      {
        version: 1,
        name: "bad-move",
        // A step only gets the copy-only view; reaching for the raw storage is the bug this guards against.
        migrate: () => storage.removeItem("ks-audio-latency-ms"),
      },
    ];
    const storage = new MemoryStorage(CURRENT_INSTALL);
    const result = runStorageMigrations(storage, steps);
    expect(result.error?.version).toBe(1);
    expect(storage.getItem("ks-audio-latency-ms")).toBe("137");
    expect(readStorageVersion(storage)).toBe(0);
  });

  it("copes with storage that cannot be used at all", () => {
    expect(runStorageMigrations(null).error?.message).toBe("storage unavailable");
    const broken = new MemoryStorage();
    broken.getItem = () => {
      throw new Error("SecurityError");
    };
    expect(runStorageMigrations(broken)).toEqual({ from: 0, to: 0, applied: [], error: { version: null, message: "SecurityError" } });
  });
});

describe("copyOnly", () => {
  it("copies forward without overwriting or moving", () => {
    const storage = new MemoryStorage({ "ks-old": "a", "mp-taken": "keep" });
    const view = copyOnly(storage);
    expect(view.copyIfAbsent("ks-old", "mp-new")).toBe(true);
    expect(view.copyIfAbsent("ks-old", "mp-taken")).toBe(false);
    expect(view.copyIfAbsent("ks-missing", "mp-other")).toBe(false);
    expect(view.copyIfAbsent("ks-old", "mp-shaped", (v) => v.toUpperCase())).toBe(true);
    expect(view.copyIfAbsent("ks-old", "mp-skipped", () => null)).toBe(false);
    expect(view.setIfAbsent("ks-old", "overwrite")).toBe(false);
    expect(storage.snapshot()).toEqual({ "ks-old": "a", "mp-taken": "keep", "mp-new": "a", "mp-shaped": "A" });
    expect(view.keys().sort()).toEqual(["ks-old", "mp-new", "mp-shaped", "mp-taken"]);
  });

  it("offers no way to delete or overwrite", () => {
    const view = copyOnly(new MemoryStorage()) as unknown as Record<string, unknown>;
    expect(view.removeItem).toBeUndefined();
    expect(view.clear).toBeUndefined();
    expect(view.setItem).toBeUndefined();
  });
});

describe("the migration list", () => {
  it("is numbered 1, 2, 3, ... with no gaps", () => {
    expect(() => assertMigrationOrder(STORAGE_MIGRATIONS)).not.toThrow();
    expect(() => assertMigrationOrder([{ version: 2, name: "gap", migrate: () => {} }])).toThrow(/expected 1/);
  });
});
