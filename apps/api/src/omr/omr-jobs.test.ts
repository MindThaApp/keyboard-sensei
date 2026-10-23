import { describe, expect, it } from "vitest";
import { OmrQueue } from "./omr-jobs.js";
import { OmrError, sheetMusicKind } from "./omr-service.js";

/** Work that finishes only when the test says so. */
function controllable() {
  const pending: { input: Uint8Array; resolve: (value: string) => void; reject: (error: unknown) => void }[] = [];
  const work = (input: Uint8Array) =>
    new Promise<string>((resolve, reject) => {
      pending.push({ input, resolve, reject });
    });
  return { work, pending };
}

const bytes = (value: number) => new Uint8Array([value]);

describe("OmrQueue", () => {
  it("runs one job at a time, in order, and reports queue positions", async () => {
    const { work, pending } = controllable();
    const queue = new OmrQueue(work);
    const a = queue.submit("u1", bytes(1));
    const b = queue.submit("u2", bytes(2));
    const c = queue.submit("u3", bytes(3));
    expect(pending).toHaveLength(1);
    expect([a.status, b.status, c.status]).toEqual(["recognising", "queued", "queued"]);
    expect([queue.position(a), queue.position(b), queue.position(c)]).toEqual([0, 1, 2]);
    // The upload is not kept once its job starts.
    expect(a.input).toBeNull();
    expect(b.input).not.toBeNull();

    pending[0]!.resolve("first");
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(a).toMatchObject({ status: "ready", result: "first" });
    expect(b.status).toBe("recognising");
    expect(pending[1]!.input).toEqual(bytes(2));
    expect(queue.position(c)).toBe(1);

    pending[1]!.reject(new OmrError("no_music", "No sheet music was recognised"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(b).toMatchObject({ status: "failed", error: { code: "no_music", message: "No sheet music was recognised" } });
    pending[2]!.reject(new Error("internal detail"));
    await queue.whenIdle();
    // Unexpected errors don't leak their message to the user.
    expect(c.error?.code).toBe("omr_failed");
    expect(c.error?.message).not.toContain("internal detail");
  });

  it("keeps jobs private to their user", () => {
    const queue = new OmrQueue(controllable().work);
    const job = queue.submit("owner", bytes(1));
    expect(queue.get(job.id, "owner")).toBe(job);
    expect(queue.get(job.id, "stranger")).toBeNull();
    expect(queue.remove(job.id, "stranger")).toBe(false);
    expect(queue.remove(job.id, "owner")).toBe(true);
    expect(queue.get(job.id, "owner")).toBeNull();
  });

  it("allows one unfinished job per user and caps the waiting list", () => {
    const queue = new OmrQueue(controllable().work, { maxWaiting: 2 });
    queue.submit("u1", bytes(1));
    expect(() => queue.submit("u1", bytes(2))).toThrow(expect.objectContaining({ code: "omr_in_progress", status: 429 }));
    queue.submit("u2", bytes(2));
    queue.submit("u3", bytes(3));
    expect(() => queue.submit("u4", bytes(4))).toThrow(expect.objectContaining({ code: "omr_busy", status: 503 }));
  });

  it("drops a waiting job that is discarded before it runs", async () => {
    const { work, pending } = controllable();
    const queue = new OmrQueue(work);
    queue.submit("u1", bytes(1));
    const waiting = queue.submit("u2", bytes(2));
    const last = queue.submit("u3", bytes(3));
    queue.remove(waiting.id, "u2");
    pending[0]!.resolve("done");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(pending).toHaveLength(2);
    expect(pending[1]!.input).toEqual(bytes(3));
    expect(last.status).toBe("recognising");
  });

  it("forgets finished jobs after the keep time", async () => {
    let now = 1_000;
    const queue = new OmrQueue(async () => "done", { keepFinishedMs: 500, now: () => now });
    const job = queue.submit("u1", bytes(1));
    await queue.whenIdle();
    expect(queue.get(job.id, "u1")?.status).toBe("ready");
    now += 499;
    expect(queue.get(job.id, "u1")).not.toBeNull();
    now += 2;
    expect(queue.get(job.id, "u1")).toBeNull();
  });
});

describe("sheetMusicKind", () => {
  it("knows PDFs, PNGs and JPEGs by their first bytes, whatever they are called", () => {
    expect(sheetMusicKind(new TextEncoder().encode("%PDF-1.7\n"))).toBe("pdf");
    expect(sheetMusicKind(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe("png");
    expect(sheetMusicKind(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpeg");
    expect(sheetMusicKind(new TextEncoder().encode("<?xml version"))).toBeNull();
    expect(sheetMusicKind(new Uint8Array([]))).toBeNull();
  });
});
