/**
 * Small async key/value store for offline data (spec 8.5): IndexedDB in the
 * browser, the Android WebView and the Windows WebView2; an in-memory map where
 * IndexedDB is missing (tests, very old browsers), so callers never branch.
 *
 * Database name `mp-offline`, object store `kv`. Both are fixed forever once
 * shipped: renaming either would strand every queued offline attempt.
 */
export interface KeyValueStore {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  /** Keys starting with `prefix`, in key order. */
  keys(prefix: string): Promise<string[]>;
}

export const OFFLINE_DB_NAME = "mp-offline";
export const OFFLINE_DB_VERSION = 1;
const STORE = "kv";

export function createMemoryStore(): KeyValueStore {
  const map = new Map<string, unknown>();
  // Values are cloned on the way in and out, like IndexedDB's structured clone.
  const clone = <T>(value: T): T => (value === undefined ? value : structuredClone(value));
  return {
    get: async <T>(key: string) => clone(map.get(key) as T | undefined),
    set: async (key, value) => void map.set(key, clone(value)),
    delete: async (key) => void map.delete(key),
    keys: async (prefix) => [...map.keys()].filter((key) => key.startsWith(prefix)).sort(),
  };
}

const promised = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

export function createIndexedDbStore(factory: IDBFactory, name = OFFLINE_DB_NAME): KeyValueStore {
  let opening: Promise<IDBDatabase> | null = null;
  const open = () => {
    opening ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open(name, OFFLINE_DB_VERSION);
      // Upgrades only ever add stores; existing data is never dropped.
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        opening = null;
        reject(request.error);
      };
    });
    return opening;
  };
  const run = async <T>(mode: IDBTransactionMode, body: (store: IDBObjectStore) => IDBRequest<T>) => {
    const db = await open();
    return promised(body(db.transaction(STORE, mode).objectStore(STORE)));
  };
  return {
    get: <T>(key: string) => run("readonly", (store) => store.get(key) as IDBRequest<T | undefined>),
    set: async (key, value) => void (await run("readwrite", (store) => store.put(value, key))),
    delete: async (key) => void (await run("readwrite", (store) => store.delete(key))),
    keys: async (prefix) => {
      // "￿" bounds the prefix range: every key starting with prefix sorts below it.
      const range = IDBKeyRange.bound(prefix, `${prefix}￿`);
      const keys = await run("readonly", (store) => store.getAllKeys(range));
      return keys.map(String);
    },
  };
}

let current: KeyValueStore | null = null;

export function offlineStore(): KeyValueStore {
  current ??= typeof indexedDB !== "undefined" ? createIndexedDbStore(indexedDB) : createMemoryStore();
  return current;
}

/** Tests swap in a fresh memory store. */
export function setOfflineStore(store: KeyValueStore | null): void {
  current = store;
}
