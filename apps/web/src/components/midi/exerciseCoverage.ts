/** The part of an expected note the coverage check needs. */
export interface CoverageNote {
  id: string;
  note: number;
  startBeat: number;
}

/**
 * Which expected notes the player has found so far. Order does not matter: the n-th
 * expected note of a pitch counts once that pitch has been pressed n times. Used by the
 * live note chips and to auto-finish untimed exercises.
 */
export function coveredNoteIds(expected: CoverageNote[], pressed: number[]): Set<string> {
  const pressCount = new Map<number, number>();
  for (const note of pressed) pressCount.set(note, (pressCount.get(note) ?? 0) + 1);
  const seen = new Map<number, number>();
  const covered = new Set<string>();
  for (const event of [...expected].sort((a, b) => a.startBeat - b.startBeat)) {
    const index = seen.get(event.note) ?? 0;
    seen.set(event.note, index + 1);
    if ((pressCount.get(event.note) ?? 0) > index) covered.add(event.id);
  }
  return covered;
}

export interface NoteGroup<T extends CoverageNote> {
  startBeat: number;
  notes: T[];
}

/** Expected notes that start together (a chord, or a single note) as one group, in time order. */
export function groupByStart<T extends CoverageNote>(expected: T[]): NoteGroup<T>[] {
  const groups = new Map<number, T[]>();
  for (const event of expected) {
    const group = groups.get(event.startBeat);
    if (group) group.push(event);
    else groups.set(event.startBeat, [event]);
  }
  return [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([startBeat, notes]) => ({ startBeat, notes }));
}
