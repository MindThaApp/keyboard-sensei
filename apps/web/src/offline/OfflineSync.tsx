import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useProgressStore } from "../state/progressStore";
import { offlineStatus, runOfflineSync, startOfflineSync, subscribeOfflineStatus, type OfflineStatus } from "./offlineSync";

const refreshProgress = () => {
  const store = useProgressStore.getState();
  if (store.loaded) void store.loadAll();
};

/** Starts offline sync, re-runs it on sign-in, and shows a note while offline or while attempts wait. */
export default function OfflineSync() {
  const { authenticated } = useAuth();
  const [status, setStatus] = useState<OfflineStatus>(offlineStatus);

  useEffect(() => subscribeOfflineStatus(setStatus), []);
  useEffect(() => startOfflineSync(refreshProgress), []);
  useEffect(() => {
    if (authenticated) void runOfflineSync({ onReplayed: refreshProgress });
  }, [authenticated]);

  if (!authenticated || (status.online && status.pending === 0)) return null;
  const waiting = status.pending === 1 ? "1 attempt is" : `${status.pending} attempts are`;
  return (
    <div role="status" className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-3 pointer-events-none">
      <p className="pointer-events-auto rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs text-amber-900 shadow dark:border-amber-700/70 dark:bg-amber-950/80 dark:text-amber-100">
        {status.online
          ? `${waiting} waiting to sync.`
          : status.pending > 0
            ? `You're offline. ${waiting} saved on this device and will sync when you're back online.`
            : "You're offline. Downloaded lessons still work; your attempts sync when you're back online."}
      </p>
    </div>
  );
}
