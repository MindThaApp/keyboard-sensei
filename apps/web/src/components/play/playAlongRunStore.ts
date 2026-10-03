import { create } from "zustand";
import type { PlayAlongLiveStats } from "@keyboard-sensei/playalong-core";

/**
 * The fast-changing state of a play-along run. It lives outside PlayAlongPage's
 * own state so that a score change re-renders only the HUD, and a wait-mode key
 * highlight re-renders only the piano — not the whole page, the 88-key piano and
 * the notation every ~120ms, which is what happened when these were page state.
 * Components subscribe to exactly the slice they draw.
 */
export interface PlayAlongRunState {
  stats: PlayAlongLiveStats;
  /** Whole seconds left in the lead-in, or null once the song has started. */
  countdown: number | null;
  waiting: boolean;
  /** Pitches the song is frozen on in wait mode. */
  waitingNotes: number[];
  /** Song time, throttled to the HUD rate. Only the OSMD notation reads it. */
  songTimeS: number;
}

export const INITIAL_STATS: PlayAlongLiveStats = { judgedCount: 0, accuracyPct: 100, combo: 0, maxCombo: 0, wrongPressCount: 0 };

const initialState = (): PlayAlongRunState => ({
  stats: INITIAL_STATS,
  countdown: null,
  waiting: false,
  waitingNotes: [],
  songTimeS: 0,
});

export const usePlayAlongRunStore = create<PlayAlongRunState>()(initialState);

export function resetPlayAlongRun(): void {
  usePlayAlongRunStore.setState(initialState());
}

/** Publishes a snapshot, keeping the previous value of any field that didn't change so its subscribers stay put. */
export function publishPlayAlongRun(next: PlayAlongRunState): void {
  const current = usePlayAlongRunStore.getState();
  const sameNotes =
    current.waitingNotes.length === next.waitingNotes.length &&
    current.waitingNotes.every((note, i) => note === next.waitingNotes[i]);
  usePlayAlongRunStore.setState({
    stats: next.stats,
    countdown: next.countdown,
    waiting: next.waiting,
    waitingNotes: sameNotes ? current.waitingNotes : next.waitingNotes,
    songTimeS: next.songTimeS,
  });
}
