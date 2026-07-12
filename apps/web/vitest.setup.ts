// Tests run in Node, which has no localStorage. Provide a minimal in-memory
// stand-in here rather than polyfilling globalThis from application code — a
// production module must never monkey-patch a global to make its tests pass.
const store = new Map<string, string>();

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    clear: () => store.clear(),
    getItem: (name: string) => store.get(name) ?? null,
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() { return store.size },
    removeItem: (name: string) => store.delete(name),
    setItem: (name: string, value: string) => store.set(name, String(value)),
  },
});
