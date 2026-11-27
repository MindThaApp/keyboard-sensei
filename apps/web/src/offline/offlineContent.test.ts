import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryStore, setOfflineStore } from "./kvStore";
import { cachedBundle, cachedExercise, cachedLessonDetail, cachedLessonList, rememberLessonDetail, rememberLessonList, syncContentBundle } from "./offlineContent";
import { bundle, exercise, listItem } from "./testFixtures";

beforeEach(() => setOfflineStore(createMemoryStore()));

describe("content bundle sync", () => {
  it("downloads once, then sends the known hash and keeps the copy on 304", async () => {
    const fetchBundle = vi.fn(async (known?: string) => (known ? null : bundle("hash-1")));
    expect(await syncContentBundle(fetchBundle)).toBe(true);
    expect(await syncContentBundle(fetchBundle)).toBe(false);
    expect(fetchBundle).toHaveBeenLastCalledWith("hash-1");
    expect((await cachedBundle())?.contentHash).toBe("hash-1");
  });

  it("replaces the copy when the hash changes", async () => {
    await syncContentBundle(async () => bundle("hash-1"));
    expect(await syncContentBundle(async () => bundle("hash-2"))).toBe(true);
    expect((await cachedBundle())?.contentHash).toBe("hash-2");
  });

  it("keeps the old copy when the download fails", async () => {
    await syncContentBundle(async () => bundle("hash-1"));
    await expect(syncContentBundle(async () => { throw new TypeError("Failed to fetch"); })).rejects.toThrow();
    expect((await cachedBundle())?.contentHash).toBe("hash-1");
  });
});

describe("cached lessons", () => {
  it("returns the account's last lesson list, never another account's", async () => {
    await rememberLessonList("u1", [listItem("lesson-01", "completed", 1)]);
    expect((await cachedLessonList("u1"))?.[0]?.progress.status).toBe("completed");
    expect(await cachedLessonList("u2")).toBeUndefined();
  });

  it("builds a list from the bundle with only the first lesson open when never listed online", async () => {
    await syncContentBundle(async () => bundle());
    const list = await cachedLessonList("u2");
    expect(list?.map((item) => [item.id, item.progress.status])).toEqual([["lesson-01", "unlocked"], ["lesson-02", "locked"]]);
  });

  it("assembles a lesson detail from the bundle and the cached progress", async () => {
    await syncContentBundle(async () => bundle());
    await rememberLessonList("u1", [listItem("lesson-01", "completed", 1), listItem("lesson-02", "unlocked", 2)]);
    const detail = await cachedLessonDetail("u1", "lesson-02");
    expect(detail?.exercises.map((item) => item.exerciseId)).toEqual(["exercise-02"]);
    expect(detail?.progress?.status).toBe("unlocked");
    expect(await cachedLessonDetail("u1", "lesson-99")).toBeUndefined();
  });

  it("falls back to a lesson opened online when no bundle has it", async () => {
    await rememberLessonDetail("u1", { lesson: { id: "lesson-07" } as never, progress: null, exercises: [exercise("exercise-07")], exerciseBests: { "exercise-07": 80 } });
    expect((await cachedLessonDetail("u1", "lesson-07"))?.exerciseBests).toEqual({ "exercise-07": 80 });
    expect((await cachedExercise("u1", "exercise-07"))?.exerciseId).toBe("exercise-07");
    expect(await cachedExercise("u2", "exercise-07")).toBeUndefined();
  });
});
