import { useSyncExternalStore } from "react";
import type { Rewards } from "../services/api";

/**
 * Progress rewards that came back with a saved attempt (XP, stars, achievements,
 * unlocked songs, the daily goal). The API client publishes every one here, so any
 * screen that saves an attempt gets the toasts — and the header ring refreshes —
 * without that screen knowing about progression at all.
 */

let pending: { id: number; rewards: Rewards }[] = [];
let received = 0;
let nextId = 1;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of [...listeners]) listener();
}

export function publishRewards(rewards: Rewards | null | undefined): void {
  if (!rewards) return;
  pending = [...pending, { id: nextId++, rewards }];
  received += 1;
  emit();
}

export function dismissRewards(id: number): void {
  pending = pending.filter((entry) => entry.id !== id);
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Rewards waiting to be shown as toasts. */
export function usePendingRewards(): { id: number; rewards: Rewards }[] {
  return useSyncExternalStore(subscribe, () => pending);
}

/** A number that changes whenever new rewards arrive: put it in an effect's deps to refetch. */
export function useRewardsVersion(): number {
  return useSyncExternalStore(subscribe, () => received);
}
