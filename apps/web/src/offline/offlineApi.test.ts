import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../services/api";
import { createMemoryStore, setOfflineStore } from "./kvStore";
import { syncContentBundle } from "./offlineContent";
import { pendingAttempts } from "./outbox";
import { runOfflineSync } from "./offlineSync";
import { bundle, goodNotes, listItem, tokenFor } from "./testFixtures";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const offline = () => Promise.reject(new TypeError("Failed to fetch"));

beforeEach(async () => {
  setOfflineStore(createMemoryStore());
  localStorage.clear();
  api.setToken(tokenFor("user-1"));
  await syncContentBundle(async () => bundle());
});
afterEach(() => vi.unstubAllGlobals());

describe("API client offline fallback", () => {
  it("serves the cached lesson list and progress when the server is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(200, [listItem("lesson-01", "completed", 1)])));
    await api.getLessons();
    await new Promise((resolve) => setTimeout(resolve, 0));
    vi.stubGlobal("fetch", vi.fn(offline));
    expect((await api.getLessons())[0]?.progress.status).toBe("completed");
    expect((await api.getLesson("lesson-02")).exercises[0]?.exerciseId).toBe("exercise-02");
  });

  it("treats a gateway error as unreachable but passes real API errors through", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(503, null)));
    expect(await api.getLessons()).toHaveLength(2);
    vi.stubGlobal("fetch", vi.fn(async () => json(401, { error: { message: "nope", code: "unauthorized" } })));
    await expect(api.getLessons()).rejects.toMatchObject({ status: 401 });
  });

  it("does not show cached data to a different account", async () => {
    vi.stubGlobal("fetch", vi.fn(offline));
    api.clearToken();
    await expect(api.getLessons()).rejects.toThrow("Failed to fetch");
  });

  it("sends a client attempt id online", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json(201, { score: 90, rewards: null }));
    vi.stubGlobal("fetch", fetchMock);
    await api.submitExerciseAttempt("exercise-01", { performedNotes: goodNotes });
    const sent = JSON.parse(String(fetchMock.mock.calls[0]![1]!.body));
    expect(sent.clientAttemptId).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(sent.playedAt).toBeUndefined();
  });

  it("scores offline from cached content, queues the attempt and replays it once back online", async () => {
    vi.stubGlobal("fetch", vi.fn(offline));
    const result = await api.submitExerciseAttempt("exercise-01", { performedNotes: goodNotes });
    expect(result.offline).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(70);
    const [queued] = await pendingAttempts("user-1");
    expect(queued?.payload.playedAt).toBeTruthy();

    // Still offline: sync leaves it queued.
    await runOfflineSync();
    expect(await pendingAttempts("user-1")).toHaveLength(1);

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) =>
      url.endsWith("/content/offline") ? new Response(null, { status: 304 }) : json(201, { score: 95, rewards: null, _body: init?.body }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const onReplayed = vi.fn();
    const report = await runOfflineSync({ onReplayed });
    expect(report).toEqual({ sent: 1, rejected: 0, remaining: 0 });
    expect(onReplayed).toHaveBeenCalledOnce();
    expect(await pendingAttempts("user-1")).toEqual([]);
    const replayBody = JSON.parse(String(fetchMock.mock.calls[0]![1]!.body));
    expect(replayBody.clientAttemptId).toBe(queued!.clientAttemptId);
    expect(fetchMock.mock.calls[1]![0]).toMatch(/\/content\/offline$/);
    expect((fetchMock.mock.calls[1]![1]!.headers as Record<string, string>)["if-none-match"]).toBe('"hash-1"');
  });

  it("does not queue an exercise that was never downloaded", async () => {
    vi.stubGlobal("fetch", vi.fn(offline));
    await expect(api.submitExerciseAttempt("exercise-99", { performedNotes: goodNotes })).rejects.toThrow("Failed to fetch");
    expect(await pendingAttempts()).toEqual([]);
  });

  it("keeps the outbox when the account is signed out on replay", async () => {
    vi.stubGlobal("fetch", vi.fn(offline));
    await api.submitExerciseAttempt("exercise-01", { performedNotes: goodNotes });
    vi.stubGlobal("fetch", vi.fn(async () => json(401, { error: { message: "expired" } })));
    await runOfflineSync();
    expect(await pendingAttempts("user-1")).toHaveLength(1);
  });
});
