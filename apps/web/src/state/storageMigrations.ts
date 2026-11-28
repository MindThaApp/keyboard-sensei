/**
 * Ordered, idempotent steps that bring an install's local storage up to date
 * (docs/specs/MUSIC-PORTAL.md, 1.3). They run once at start-up, before any store reads
 * (see migrateStorageOnStartup.ts), and record progress in `mp-storage-version`.
 *
 * The rules, enforced by the `CopyOnlyStorage` a step receives:
 * - a step never deletes a key and never overwrites one: it can only write a key that is
 *   still empty, so data is copied forward and the old copy stays where it was;
 * - a step can run again safely (a crash between the step and the version marker means it
 *   will), which the copy-if-absent rule gives for free;
 * - a failing step stops the run with the marker at the last step that finished, and the
 *   app starts normally; the next start tries again.
 *
 * To add a step: append it with the next version number, add any new key to
 * storageKeys.ts, and add a test with the fixture in storageMigrations.test.ts.
 */

export const STORAGE_VERSION_KEY = "mp-storage-version";

/** What a step may do: read anything, write only keys that are empty. */
export interface CopyOnlyStorage {
  getItem(key: string): string | null;
  /** Every key currently stored. */
  keys(): string[];
  /** Writes `value` to `key` only if `key` is empty. Returns whether it wrote. */
  setIfAbsent(key: string, value: string): boolean;
  /**
   * Copies `from` to `to` (optionally reshaped) only if `from` exists and `to` is empty.
   * `transform` may return null to skip the copy. Returns whether it wrote.
   */
  copyIfAbsent(from: string, to: string, transform?: (value: string) => string | null): boolean;
}

export interface StorageMigration {
  /** 1, 2, 3, ...: strictly increasing, never reused or renumbered. */
  version: number;
  /** Short description for logs and tests. */
  name: string;
  migrate(storage: CopyOnlyStorage): void;
}

export const STORAGE_MIGRATIONS: readonly StorageMigration[] = [
  {
    version: 1,
    name: "music-portal-baseline",
    // The rename keeps every existing key exactly as it is (spec 1.2), so there is nothing
    // to copy. This step only marks installs that have been through the framework once.
    migrate: () => {},
  },
];

export const LATEST_STORAGE_VERSION = STORAGE_MIGRATIONS[STORAGE_MIGRATIONS.length - 1]?.version ?? 0;

export interface StorageMigrationResult {
  /** The version found at start (0 for a fresh or pre-framework install). */
  from: number;
  /** The version stored when the run ended. */
  to: number;
  /** Versions of the steps that ran in this call. */
  applied: number[];
  /** Set when a step (or storage itself) failed; the app carries on regardless. */
  error?: { version: number | null; message: string };
}

export function readStorageVersion(storage: Pick<Storage, "getItem">): number {
  const raw = storage.getItem(STORAGE_VERSION_KEY);
  if (raw === null || !/^\d+$/.test(raw)) return 0;
  return Number(raw);
}

/** Throws when the list is not strictly increasing from 1; a programming error, caught by the tests. */
export function assertMigrationOrder(migrations: readonly StorageMigration[]): void {
  migrations.forEach((migration, index) => {
    if (migration.version !== index + 1) {
      throw new Error(`Storage migration "${migration.name}" has version ${migration.version}, expected ${index + 1}`);
    }
  });
}

export function copyOnly(storage: Storage): CopyOnlyStorage {
  const has = (key: string) => storage.getItem(key) !== null;
  return {
    getItem: (key) => storage.getItem(key),
    keys: () => {
      const keys: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key !== null) keys.push(key);
      }
      return keys;
    },
    setIfAbsent(key, value) {
      if (has(key)) return false;
      storage.setItem(key, value);
      return true;
    },
    copyIfAbsent(from, to, transform) {
      const value = storage.getItem(from);
      if (value === null || has(to)) return false;
      const next = transform ? transform(value) : value;
      if (next === null) return false;
      storage.setItem(to, next);
      return true;
    },
  };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function runStorageMigrations(
  storage: Storage | null = defaultStorage(),
  migrations: readonly StorageMigration[] = STORAGE_MIGRATIONS,
): StorageMigrationResult {
  assertMigrationOrder(migrations);
  if (!storage) return { from: 0, to: 0, applied: [], error: { version: null, message: "storage unavailable" } };

  let current: number;
  try {
    current = readStorageVersion(storage);
  } catch (error) {
    return { from: 0, to: 0, applied: [], error: { version: null, message: message(error) } };
  }
  const from = current;
  const applied: number[] = [];
  const view = copyOnly(storage);

  // A marker above the newest known step means a newer build ran here before (a
  // downgrade): leave everything alone.
  for (const migration of migrations) {
    if (migration.version <= current) continue;
    try {
      migration.migrate(view);
      storage.setItem(STORAGE_VERSION_KEY, String(migration.version));
    } catch (error) {
      return { from, to: current, applied, error: { version: migration.version, message: message(error) } };
    }
    current = migration.version;
    applied.push(migration.version);
  }
  return { from, to: current, applied };
}

function defaultStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null; // access denied (blocked site data)
  }
}
