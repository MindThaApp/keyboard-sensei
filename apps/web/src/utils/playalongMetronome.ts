import { BeatCursor, type BeatGridEntry, type ClickLevel } from "@keyboard-sensei/playalong-core";
import { playClick, type MetronomeSound } from "./clickTimbres";
import { addScheduleSource, contextTimeAt, getAudioContext, traceScheduled } from "../audio/audioEngine";

export { CLICK_LEVELS, type ClickLevel } from "@keyboard-sensei/playalong-core";

/** The slice of PlayAlongEngine the metronome follows. */
export interface SongClock {
  songTime(nowMs: number): number;
  clockTimeAt(songTimeS: number): number;
  readonly isWaiting: boolean;
  readonly isPaused: boolean;
  readonly isFinished: boolean;
}

export interface ClickSettings {
  enabled: boolean;
  sound: MetronomeSound;
  volume: number;
  level: ClickLevel;
}

/**
 * A metronome that follows a song's beat grid instead of free-running at a fixed BPM.
 *
 * Why not reuse Metronome (utils/metronome.ts): that class clicks at a fixed
 * BPM. It cannot follow a tempo map, cannot re-anchor to the song clock, and
 * cannot pause. On the library songs with a real tempo map it would go a
 * half-beat wrong within a bar or two.
 *
 * Every scheduler tick, the beats falling inside the next lookahead window of
 * SONG time (read off the engine's own clock) are scheduled at the exact clock
 * time the engine says the song reaches them. Nothing is computed far ahead, so
 * there is nothing to drift; a wait-mode freeze or a pause simply stops the
 * window advancing — at most one already-queued click can still land.
 */
export class PlayAlongMetronome {
  private readonly cursor: BeatCursor;

  constructor(beats: readonly BeatGridEntry[]) {
    this.cursor = new BeatCursor(beats);
  }

  /** Start following `clock`. `settings` is re-read every tick. Returns the stop function. */
  follow(clock: SongClock, settings: () => ClickSettings): () => void {
    this.cursor.reset();
    return addScheduleSource((nowMs, horizonMs) => {
      if (clock.isFinished || clock.isPaused || clock.isWaiting) return;
      const live = settings();
      const fromS = clock.songTime(nowMs);
      const toS = clock.songTime(nowMs + horizonMs);
      const due = this.cursor.take(fromS, toS, live.level);
      if (!live.enabled) return;
      for (const beat of due) {
        const atMs = clock.clockTimeAt(beat.timeS);
        const when = contextTimeAt(atMs);
        traceScheduled("click", atMs, when);
        playClick(getAudioContext(), when, beat.isDownbeat, live.volume, live.sound);
      }
    });
  }
}
