import { useSyncExternalStore } from "react";

/**
 * User-visible audio problems (a sample pack that failed to load, so the app fell
 * back to the built-in synth). Each one is also logged as a console warning.
 * Before this existed, those failures were silent: the instrument just sounded
 * wrong with no explanation.
 */
export interface AudioNotice {
  id: number;
  message: string;
}

let notices: AudioNotice[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function publish(next: AudioNotice[]): void {
  notices = next;
  for (const listener of [...listeners]) listener();
}

export function reportAudioProblem(message: string, detail?: unknown): void {
  console.warn(`[audio] ${message}`, ...(detail === undefined ? [] : [detail]));
  // The same problem reported twice (e.g. re-selecting a broken instrument) shows once.
  if (notices.some((notice) => notice.message === message)) return;
  publish([...notices, { id: nextId++, message }]);
}

export function dismissAudioNotice(id: number): void {
  publish(notices.filter((notice) => notice.id !== id));
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useAudioNotices(): AudioNotice[] {
  return useSyncExternalStore(subscribe, () => notices);
}
