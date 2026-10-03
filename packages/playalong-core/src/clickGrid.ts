import type { BeatGridEntry } from "./song";

/** Which beats the click lands on. */
export type ClickLevel = "bar" | "beat" | "subdivision";

export const CLICK_LEVELS: ReadonlyArray<{ value: ClickLevel; label: string; description: string }> = [
  { value: "bar", label: "Bar", description: "One click per bar, on the downbeat. Least intrusive — for when your time is already solid." },
  { value: "beat", label: "Beat", description: "The pulse you'd count out loud. In 6/8 that's two clicks per bar, not six." },
  { value: "subdivision", label: "Subdivision", description: "Every notated beat, including the inner ones. Dense, but it exposes rushed rhythms." },
];

export function beatClicks(beat: Pick<BeatGridEntry, "isDownbeat" | "isMainBeat">, level: ClickLevel): boolean {
  if (level === "bar") return beat.isDownbeat;
  if (level === "beat") return beat.isMainBeat;
  return true;
}

/**
 * Walks a song's beat grid with a cursor, handing out each beat once as the song
 * clock reaches it. Grid times are SONG seconds; the caller converts each to its
 * own clock when it schedules the click.
 */
export class BeatCursor {
  private cursor = 0;

  constructor(private readonly beats: readonly BeatGridEntry[]) {}

  /**
   * Beats in [fromSongS, toSongS] that have not been handed out yet. Beats already
   * behind `fromSongS` (after a seek, or during the count-in) are skipped, never
   * delivered late in a burst.
   */
  take(fromSongS: number, toSongS: number, level: ClickLevel): BeatGridEntry[] {
    while (this.cursor < this.beats.length && this.beats[this.cursor]!.timeS < fromSongS) this.cursor++;
    const due: BeatGridEntry[] = [];
    while (this.cursor < this.beats.length) {
      const beat = this.beats[this.cursor]!;
      if (beat.timeS > toSongS) break;
      if (beatClicks(beat, level)) due.push(beat);
      this.cursor++;
    }
    return due;
  }

  /** Forget everything handed out at or after `songS`, so it is handed out again. */
  rewindTo(songS: number): void {
    while (this.cursor > 0 && this.beats[this.cursor - 1]!.timeS >= songS) this.cursor--;
  }

  reset(): void {
    this.cursor = 0;
  }
}
