import { randomUUID } from "node:crypto";
import { OmrError } from "./omr-service.js";

/**
 * The recognition queue: in memory, one job at a time (the OMR service is single-threaded
 * by design, and Audiveris wants both cores and ~1 GB while it runs). A job is private to
 * the user who sent it; nothing is written to disk or the database until they review the
 * result and save it. A restart loses queued and unsaved jobs, which is acceptable for a beta.
 */

export type OmrJobStatus = "queued" | "recognising" | "ready" | "failed";

export interface OmrJob<R> {
  id: string;
  userId: string;
  status: OmrJobStatus;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  /** The uploaded file; dropped as soon as recognition ends. */
  input: Uint8Array | null;
  result: R | null;
  error: { code: string; message: string } | null;
}

export interface OmrQueueOptions {
  /** Jobs waiting (not counting the one running), across all users. */
  maxWaiting?: number;
  /** How long a finished job (ready or failed) is kept for its user to see. */
  keepFinishedMs?: number;
  now?: () => number;
}

export class OmrQueue<R> {
  private readonly jobs = new Map<string, OmrJob<R>>();
  private readonly waiting: OmrJob<R>[] = [];
  private running: OmrJob<R> | null = null;
  private readonly maxWaiting: number;
  private readonly keepFinishedMs: number;
  private readonly now: () => number;
  /** The running job's work. */
  private idle: Promise<void> = Promise.resolve();

  constructor(
    private readonly work: (input: Uint8Array) => Promise<R>,
    options: OmrQueueOptions = {},
  ) {
    this.maxWaiting = options.maxWaiting ?? 5;
    this.keepFinishedMs = options.keepFinishedMs ?? 60 * 60 * 1000;
    this.now = options.now ?? Date.now;
  }

  submit(userId: string, input: Uint8Array): OmrJob<R> {
    this.sweep();
    for (const job of this.jobs.values()) {
      if (job.userId === userId && (job.status === "queued" || job.status === "recognising")) {
        throw new OmrError("omr_in_progress", "You already have sheet music being recognised. Wait for it to finish first.", 429);
      }
    }
    if (this.waiting.length >= this.maxWaiting) {
      throw new OmrError("omr_busy", "Lots of sheet music is being recognised right now. Try again in a few minutes.", 503);
    }
    const job: OmrJob<R> = {
      id: randomUUID(),
      userId,
      status: "queued",
      createdAt: this.now(),
      startedAt: null,
      finishedAt: null,
      input,
      result: null,
      error: null,
    };
    this.jobs.set(job.id, job);
    this.waiting.push(job);
    this.pump();
    return job;
  }

  /** The user's own job, or null: someone else's job is indistinguishable from a missing one. */
  get(id: string, userId: string): OmrJob<R> | null {
    this.sweep();
    const job = this.jobs.get(id);
    return job && job.userId === userId ? job : null;
  }

  /** Jobs ahead of this one, the running one included; 0 once it runs. */
  position(job: OmrJob<R>): number {
    if (job.status !== "queued") return 0;
    return this.waiting.indexOf(job) + (this.running ? 1 : 0);
  }

  /** Forgets a job: a waiting one never runs, a running one's result is thrown away. */
  remove(id: string, userId: string): boolean {
    const job = this.get(id, userId);
    if (!job) return false;
    this.jobs.delete(id);
    const index = this.waiting.indexOf(job);
    if (index >= 0) this.waiting.splice(index, 1);
    return true;
  }

  async whenIdle(): Promise<void> {
    while (this.running) await this.idle;
  }

  private sweep() {
    const cutoff = this.now() - this.keepFinishedMs;
    for (const [id, job] of this.jobs) {
      if (job.finishedAt !== null && job.finishedAt < cutoff) this.jobs.delete(id);
    }
  }

  private pump() {
    if (this.running) return;
    const job = this.waiting.shift();
    if (!job) return;
    this.running = job;
    job.status = "recognising";
    job.startedAt = this.now();
    const input = job.input!;
    job.input = null;
    this.idle = this.work(input)
      .then(
        (result) => {
          job.result = result;
          job.status = "ready";
        },
        (error: unknown) => {
          job.status = "failed";
          job.error =
            error instanceof OmrError
              ? { code: error.code, message: error.message }
              : { code: "omr_failed", message: "Something went wrong reading that sheet music. Try again, or try a clearer copy." };
          if (!(error instanceof OmrError)) console.error("omr job failed", error);
        },
      )
      .finally(() => {
        job.finishedAt = this.now();
        this.running = null;
        this.pump();
      });
  }
}
