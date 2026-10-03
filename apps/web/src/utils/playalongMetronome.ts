import type { BeatGridEntry } from "@keyboard-sensei/playalong-core";
import { playClick, type MetronomeSound } from "./clickTimbres";
import { registerAudioContext } from "./audioUnlock";

/** Schedule at most this far ahead, in WALL-CLOCK seconds. */
const LOOKAHEAD_WALL_S = 0.12;

/** Which beats the click lands on. */
export type ClickLevel = "bar" | "beat" | "subdivision";

export const CLICK_LEVELS: ReadonlyArray<{ value: ClickLevel; label: string; description: string }> = [
  { value: "bar", label: "Bar", description: "One click per bar, on the downbeat. Least intrusive — for when your time is already solid." },
  { value: "beat", label: "Beat", description: "The pulse you'd count out loud. In 6/8 that's two clicks per bar, not six." },
  { value: "subdivision", label: "Subdivision", description: "Every notated beat, including the inner ones. Dense, but it exposes rushed rhythms." },
];

const wanted = (beat: { isDownbeat: boolean; isMainBeat: boolean }, level: ClickLevel): boolean => {
  if (level === "bar") return beat.isDownbeat;
  if (level === "beat") return beat.isMainBeat;
  return true;
};

/**
 * A metronome that follows a song's beat grid instead of free-running at a fixed BPM.
 *
 * Why not reuse Metronome (utils/metronome.ts): that class computes
 * `secondsPerBeat = 60 / bpm` ONCE and then advances `nextBeatTime` by it forever.
 * It cannot follow a tempo map, cannot re-anchor to an external clock, and cannot
 * pause. On the 31 library songs with a real tempo map it would go a half-beat
 * wrong within one or two bars. It stays correct for lessons, where the exercise
 * has a genuinely fixed authored tempo.
 *
 * Two hazards this design exists to avoid:
 *
 * 1. CLOCK DRIFT. The engine's clock is performance.now(); Web Audio schedules on
 *    AudioContext.currentTime. These are different hardware clocks and they drift
 *    apart over a multi-minute song. So we never precompute absolute click times:
 *    `tick()` is called every animation frame and re-anchors off the engine's own
 *    songTime(), scheduling only ~120ms ahead. Cumulative drift is impossible
 *    because nothing accumulates.
 *
 * 2. WAIT MODE. PlayAlongEngine freezes song time while it waits for the player.
 *    Anything that pre-scheduled a long way into Web Audio would keep clicking
 *    into the silence. Because we schedule from song time with a short horizon,
 *    a freeze simply stops the cursor advancing — at most one already-queued click
 *    can still land.
 *
 * The grid is in SONG seconds and is never rescaled: PlayAlongEngine.songTime() is
 * already rate-scaled, so the tempo slider moves the song, the falling bars and the
 * clicks together for free. `rate` appears in exactly one place below — converting a
 * song-time delta into a wall-clock delta for scheduling.
 */
export class PlayAlongMetronome {
  private ctx: AudioContext | null = null;
  /** Index of the next beat we haven't scheduled yet. Beats are ascending. */
  private cursor = 0;

  constructor(private readonly beats: readonly BeatGridEntry[]) {}

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      registerAudioContext(this.ctx);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  /**
   * Call once per animation frame, from the same loop that draws the waterfall.
   *
   * @param songTimeS  engine.songTime() — already rate-scaled
   * @param rate       engine playback rate (1 = written tempo)
   * @param isWaiting  engine.isWaiting — song is frozen, so emit nothing
   */
  tick(
    songTimeS: number,
    rate: number,
    isWaiting: boolean,
    sound: MetronomeSound,
    volume: number,
    level: ClickLevel = "beat",
  ): void {
    if (isWaiting || rate <= 0) return;

    // Skip beats already behind us (e.g. after a seek, or the count-in).
    while (this.cursor < this.beats.length && this.beats[this.cursor]!.timeS < songTimeS) this.cursor++;

    const ctx = this.ensureContext();
    // Convert the wall-clock horizon into song seconds: at 2x rate we cover twice
    // as much of the song in the same real time.
    const horizonSongS = songTimeS + LOOKAHEAD_WALL_S * rate;

    while (this.cursor < this.beats.length) {
      const beat = this.beats[this.cursor]!;
      if (beat.timeS > horizonSongS) break;
      if (wanted(beat, level)) {
        const whenWallS = ctx.currentTime + Math.max(0, (beat.timeS - songTimeS) / rate);
        playClick(ctx, whenWallS, beat.isDownbeat, volume, sound);
      }
      this.cursor++;
    }
  }

  /** Rewind to the start of the grid (call when a song restarts). */
  reset(): void {
    this.cursor = 0;
  }

  stop(): void {
    void this.ctx?.close();
    this.ctx = null;
    this.cursor = 0;
  }
}
