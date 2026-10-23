/**
 * The sounding notes of an engraved score over time, from Verovio's timemap.
 *
 * The timemap comes from the *expanded* score (repeats played out), which is also what
 * the song's MIDI was written from, so its times are song seconds. Repeated passes name
 * their notes `<id>-rend2`, `<id>-rend3`...; the engraving shows the score as printed,
 * so those map back to the printed note's id.
 */

export interface TimemapEntry {
  /** Milliseconds from the start, tempo applied. */
  tstamp: number;
  on?: string[];
  off?: string[];
}

export interface ScoreTimeline {
  /** Change points in song seconds, ascending. */
  timesS: number[];
  /** The printed note ids sounding from each change point until the next. */
  active: string[][];
}

export const printedId = (id: string): string => id.replace(/-rend\d+$/, "");

export function buildScoreTimeline(timemap: TimemapEntry[]): ScoreTimeline {
  const sounding = new Map<string, number>();
  const timesS: number[] = [];
  const active: string[][] = [];
  for (const entry of timemap) {
    for (const id of entry.off ?? []) {
      const printed = printedId(id);
      const count = (sounding.get(printed) ?? 0) - 1;
      if (count > 0) sounding.set(printed, count);
      else sounding.delete(printed);
    }
    for (const id of entry.on ?? []) {
      const printed = printedId(id);
      sounding.set(printed, (sounding.get(printed) ?? 0) + 1);
    }
    const timeS = entry.tstamp / 1000;
    const ids = [...sounding.keys()];
    // Entries at the same instant collapse into the last state.
    if (timesS.length > 0 && Math.abs(timesS[timesS.length - 1] - timeS) < 1e-9) active[active.length - 1] = ids;
    else {
      timesS.push(timeS);
      active.push(ids);
    }
  }
  return { timesS, active };
}

/** Ids sounding at `timeS` (none before the first note). Binary search: called every tick. */
export function activeAt(timeline: ScoreTimeline, timeS: number): string[] {
  const { timesS, active } = timeline;
  let low = 0;
  let high = timesS.length - 1;
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (timesS[mid] <= timeS) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return found < 0 ? [] : active[found];
}
