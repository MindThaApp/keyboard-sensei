import type { ExerciseAttemptPayload } from "@keyboard-sensei/shared-types";
import { offlineStore } from "./kvStore";

/**
 * Attempt outbox (spec 8.5). An attempt that cannot reach the server is stored
 * with a client-generated id and replayed later; the API stores each id once, so
 * replaying after a lost response is always safe.
 *
 * Entries are only removed after the server has answered for them. One the
 * server rejects as invalid is moved aside (`outbox-rejected:`), never deleted.
 */
export interface OutboxEntry {
  clientAttemptId: string;
  scope: string;
  exerciseId: string;
  payload: ExerciseAttemptPayload;
  queuedAt: string;
  tries: number;
}

const PENDING = "outbox:";

const changeListeners = new Set<() => void>();
/** Called after an attempt is queued or the queue was flushed. */
export function onOutboxChange(listener: () => void): () => void {
  changeListeners.add(listener);
  return () => changeListeners.delete(listener);
}
const changed = () => changeListeners.forEach((listener) => listener());
const REJECTED = "outbox-rejected:";

export function newClientAttemptId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Keys sort by queue time, so replays keep the order attempts were played in. */
const keyFor = (entry: Pick<OutboxEntry, "queuedAt" | "clientAttemptId">) => `${PENDING}${entry.queuedAt}:${entry.clientAttemptId}`;

export async function queueAttempt(scope: string, exerciseId: string, payload: ExerciseAttemptPayload, now = new Date()): Promise<OutboxEntry> {
  const clientAttemptId = payload.clientAttemptId ?? newClientAttemptId();
  const entry: OutboxEntry = {
    clientAttemptId,
    scope,
    exerciseId,
    payload: { ...payload, clientAttemptId, playedAt: payload.playedAt ?? now.toISOString() },
    queuedAt: now.toISOString(),
    tries: 0,
  };
  await offlineStore().set(keyFor(entry), entry);
  changed();
  return entry;
}

export async function pendingAttempts(scope?: string): Promise<OutboxEntry[]> {
  const store = offlineStore();
  const entries: OutboxEntry[] = [];
  for (const key of await store.keys(PENDING)) {
    const entry = await store.get<OutboxEntry>(key);
    if (entry && (scope === undefined || entry.scope === scope)) entries.push(entry);
  }
  return entries;
}

export const rejectedAttempts = async (): Promise<OutboxEntry[]> => {
  const store = offlineStore();
  const keys = await store.keys(REJECTED);
  return (await Promise.all(keys.map((key) => store.get<OutboxEntry>(key)))).filter((entry): entry is OutboxEntry => Boolean(entry));
};

/** What happened to one replay: stored (or already stored), retry later, or rejected for good. */
export type ReplayOutcome = "sent" | "retry" | "rejected" | "stop";

export interface FlushReport { sent: number; rejected: number; remaining: number }

let flushing: Promise<FlushReport> | null = null;

/**
 * Replays this account's queued attempts in order. `send` classifies each try;
 * "retry" and "stop" end the run (offline again, server trouble, signed out) and
 * leave the rest queued. Concurrent calls share one run.
 */
export function flushOutbox(scope: string, send: (entry: OutboxEntry) => Promise<ReplayOutcome>): Promise<FlushReport> {
  flushing ??= (async () => {
    const store = offlineStore();
    const report: FlushReport = { sent: 0, rejected: 0, remaining: 0 };
    const entries = await pendingAttempts(scope);
    for (const [index, entry] of entries.entries()) {
      const outcome = await send(entry);
      if (outcome === "sent") {
        await store.delete(keyFor(entry));
        report.sent += 1;
        continue;
      }
      if (outcome === "rejected") {
        await store.set(`${REJECTED}${entry.queuedAt}:${entry.clientAttemptId}`, entry);
        await store.delete(keyFor(entry));
        report.rejected += 1;
        continue;
      }
      await store.set(keyFor(entry), { ...entry, tries: entry.tries + 1 });
      report.remaining = entries.length - index;
      break;
    }
    return report;
  })().finally(() => {
    flushing = null;
    changed();
  });
  return flushing;
}
