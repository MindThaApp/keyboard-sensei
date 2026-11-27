import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryStore, setOfflineStore } from "./kvStore";
import { flushOutbox, onOutboxChange, pendingAttempts, queueAttempt, rejectedAttempts, type OutboxEntry } from "./outbox";
import { goodNotes } from "./testFixtures";

beforeEach(() => setOfflineStore(createMemoryStore()));

const at = (iso: string) => new Date(iso);

describe("attempt outbox", () => {
  it("queues with a client id and the time the attempt was played", async () => {
    const entry = await queueAttempt("u1", "exercise-01", { performedNotes: goodNotes }, at("2026-11-27T10:00:00Z"));
    expect(entry.clientAttemptId).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(entry.payload).toMatchObject({ clientAttemptId: entry.clientAttemptId, playedAt: "2026-11-27T10:00:00.000Z" });
    expect(await pendingAttempts("u1")).toHaveLength(1);
  });

  it("keeps an existing client id so a lost-response retry dedupes on the server", async () => {
    const entry = await queueAttempt("u1", "exercise-01", { performedNotes: goodNotes, clientAttemptId: "kept-id-0001" });
    expect(entry.clientAttemptId).toBe("kept-id-0001");
  });

  it("replays in played order, only for the signed-in account, and removes sent entries", async () => {
    await queueAttempt("u1", "b", {}, at("2026-11-27T10:02:00Z"));
    await queueAttempt("u1", "a", {}, at("2026-11-27T10:01:00Z"));
    await queueAttempt("u2", "other", {}, at("2026-11-27T10:00:00Z"));
    const seen: string[] = [];
    const report = await flushOutbox("u1", async (entry) => (seen.push(entry.exerciseId), "sent"));
    expect(seen).toEqual(["a", "b"]);
    expect(report).toEqual({ sent: 2, rejected: 0, remaining: 0 });
    expect(await pendingAttempts("u1")).toEqual([]);
    expect(await pendingAttempts("u2")).toHaveLength(1);
  });

  it("stops at the first retry and keeps the rest queued, counting the try", async () => {
    await queueAttempt("u1", "a", {}, at("2026-11-27T10:01:00Z"));
    await queueAttempt("u1", "b", {}, at("2026-11-27T10:02:00Z"));
    const send = vi.fn(async (_entry: OutboxEntry) => "retry" as const);
    const report = await flushOutbox("u1", send);
    expect(send).toHaveBeenCalledTimes(1);
    expect(report).toEqual({ sent: 0, rejected: 0, remaining: 2 });
    const pending = await pendingAttempts("u1");
    expect(pending.map((entry) => [entry.exerciseId, entry.tries])).toEqual([["a", 1], ["b", 0]]);
  });

  it("moves rejected attempts aside instead of deleting them", async () => {
    await queueAttempt("u1", "retired", {});
    const report = await flushOutbox("u1", async () => "rejected");
    expect(report.rejected).toBe(1);
    expect(await pendingAttempts()).toEqual([]);
    expect((await rejectedAttempts()).map((entry) => entry.exerciseId)).toEqual(["retired"]);
  });

  it("shares one run between concurrent flushes", async () => {
    await queueAttempt("u1", "a", {});
    const send = vi.fn(async () => "sent" as const);
    await Promise.all([flushOutbox("u1", send), flushOutbox("u1", send)]);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("notifies listeners on queue and flush", async () => {
    const listener = vi.fn();
    const off = onOutboxChange(listener);
    await queueAttempt("u1", "a", {});
    await flushOutbox("u1", async () => "sent");
    off();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
