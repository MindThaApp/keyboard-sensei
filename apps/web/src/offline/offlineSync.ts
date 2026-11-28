import * as api from "../services/api";
import { syncContentBundle } from "./offlineContent";
import { flushOutbox, onOutboxChange, pendingAttempts, type FlushReport } from "./outbox";
import { userScopeFromToken } from "./userScope";

/**
 * Keeps offline data current (spec 8.5): replays the outbox, then refreshes the
 * content bundle when its hash changed. Runs at start-up, on sign-in, when the
 * device comes back online and when the app returns to the foreground.
 */
export interface OfflineStatus { online: boolean; pending: number }

type Listener = (status: OfflineStatus) => void;
const listeners = new Set<Listener>();
let status: OfflineStatus = { online: typeof navigator === "undefined" ? true : navigator.onLine !== false, pending: 0 };

const publish = (next: Partial<OfflineStatus>) => {
  status = { ...status, ...next };
  for (const listener of listeners) listener(status);
};

export const offlineStatus = () => status;
export function subscribeOfflineStatus(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Re-reads the queue length for the signed-in account (after an attempt was queued). */
export async function refreshPendingCount(): Promise<void> {
  const scope = userScopeFromToken(api.getToken());
  publish({ pending: scope ? (await pendingAttempts(scope).catch(() => [])).length : 0 });
}

export interface SyncDeps {
  replay: typeof api.replayExerciseAttempt;
  fetchBundle: typeof api.fetchOfflineBundle;
  onReplayed?: (report: FlushReport) => void;
}

export async function runOfflineSync(overrides: Partial<SyncDeps> = {}): Promise<FlushReport | null> {
  const deps: SyncDeps = { replay: api.replayExerciseAttempt, fetchBundle: api.fetchOfflineBundle, ...overrides };
  const scope = userScopeFromToken(api.getToken());
  if (!scope) {
    publish({ pending: 0 });
    return null;
  }
  let report: FlushReport | null = null;
  try {
    report = await flushOutbox(scope, deps.replay);
    if (report.sent > 0) deps.onReplayed?.(report);
    await syncContentBundle(deps.fetchBundle);
    publish({ online: true });
  } catch (error) {
    if (api.isUnreachable(error)) publish({ online: false });
  } finally {
    await refreshPendingCount();
  }
  return report;
}

let started = false;

/** Installs the triggers once; `onReplayed` refreshes progress screens after a replay. */
export function startOfflineSync(onReplayed?: (report: FlushReport) => void): void {
  if (started || typeof window === "undefined") return;
  started = true;
  const run = () => void runOfflineSync({ onReplayed });
  onOutboxChange(() => void refreshPendingCount());
  window.addEventListener("online", () => {
    publish({ online: true });
    run();
  });
  window.addEventListener("offline", () => publish({ online: false }));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") run();
  });
  run();
}
