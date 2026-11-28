import { describe, expect, it } from "vitest";
import { createMemoryStore, OFFLINE_DB_NAME } from "./kvStore";

describe("memory key/value store", () => {
  it("stores clones and lists keys by prefix in order", async () => {
    const store = createMemoryStore();
    const value = { a: [1, 2] };
    await store.set("outbox:2", value);
    await store.set("outbox:1", { a: [] });
    await store.set("content:bundle", 1);
    value.a.push(3);
    expect(await store.get("outbox:2")).toEqual({ a: [1, 2] });
    expect(await store.keys("outbox:")).toEqual(["outbox:1", "outbox:2"]);
    await store.delete("outbox:1");
    expect(await store.keys("outbox:")).toEqual(["outbox:2"]);
    expect(await store.get("missing")).toBeUndefined();
  });

  it("keeps the database name fixed (queued attempts live in it)", () => {
    expect(OFFLINE_DB_NAME).toBe("mp-offline");
  });
});
