/**
 * Violin fingering model (first position and the geometry of the fingerboard).
 *
 * Pitches are MIDI numbers of SOUNDING notes (the violin is not transposing, so
 * written and sounding pitch are the same). Finger 0 is the open string.
 */

export type ViolinStringName = "G" | "D" | "A" | "E";
export const VIOLIN_STRINGS: readonly ViolinStringName[] = ["G", "D", "A", "E"];
/** MIDI number of each open string: G3 D4 A4 E5. */
export const VIOLIN_OPEN_STRING: Record<ViolinStringName, number> = { G: 55, D: 62, A: 69, E: 76 };
/** Roman numeral used to mark a string in violin music (E = I ... G = IV). */
export const VIOLIN_STRING_NUMERAL: Record<ViolinStringName, string> = { E: "I", A: "II", D: "III", G: "IV" };
/** Lowest and highest pitch the violin profile covers (G3 - E7). */
export const VIOLIN_RANGE = { low: 55, high: 100 } as const;

/**
 * A finger pattern: the semitone distance of fingers 1-4 above the open string.
 * Teaching order: "high2" (whole, whole, half: 2nd finger away from the 1st),
 * then "low2" (whole, half, whole: 2nd finger next to the 3rd), then "low1".
 */
export type FingerPatternId = "high2" | "low2" | "low1";
export const FINGER_PATTERNS: Record<FingerPatternId, readonly [number, number, number, number]> = {
  high2: [2, 4, 5, 7],
  low2: [2, 3, 5, 7],
  low1: [1, 3, 5, 7],
};
export const FINGER_PATTERN_LABELS: Record<FingerPatternId, string> = {
  high2: "High 2 (2nd finger close to the 3rd)",
  low2: "Low 2 (2nd finger close to the 1st)",
  low1: "Low 1 (1st finger close to the nut)",
};

export interface ViolinFingering {
  string: ViolinStringName;
  /** 0 = open, 1-4 = finger. */
  finger: 0 | 1 | 2 | 3 | 4;
  /** Semitones above the open string. */
  offset: number;
}

/** Semitones above the open string for a finger, 0 for open. */
export function fingerOffset(finger: number, pattern: FingerPatternId): number {
  if (finger === 0) return 0;
  const offset = FINGER_PATTERNS[pattern][finger - 1];
  if (offset === undefined) throw new RangeError(`Finger must be 0-4, got ${finger}`);
  return offset;
}

/**
 * Every first-position way to play `pitch` with the patterns given, open
 * strings first, then lower fingers first. Empty when the pitch is not
 * reachable in first position.
 */
export function fingeringsFor(pitch: number, patterns: readonly FingerPatternId[] = ["high2"]): ViolinFingering[] {
  const found: ViolinFingering[] = [];
  for (const string of VIOLIN_STRINGS) {
    const offset = pitch - VIOLIN_OPEN_STRING[string];
    if (offset < 0) continue;
    if (offset === 0) {
      found.push({ string, finger: 0, offset });
      continue;
    }
    for (const pattern of patterns) {
      const finger = FINGER_PATTERNS[pattern].indexOf(offset) + 1;
      if (finger > 0 && !found.some((f) => f.string === string && f.finger === finger)) {
        found.push({ string, finger: finger as 1 | 2 | 3 | 4, offset });
      }
    }
  }
  return found.sort((a, b) => a.finger - b.finger || VIOLIN_STRINGS.indexOf(a.string) - VIOLIN_STRINGS.indexOf(b.string));
}

/** The default fingering: the open string if there is one, else the lowest finger. */
export function defaultFingering(pitch: number, patterns: readonly FingerPatternId[] = ["high2"]): ViolinFingering | null {
  return fingeringsFor(pitch, patterns)[0] ?? null;
}

/** Does this string/finger sound `pitch` under any of the patterns? */
export function fingeringSounds(
  fingering: Pick<ViolinFingering, "string" | "finger">,
  pitch: number,
  patterns: readonly FingerPatternId[],
): boolean {
  const open = VIOLIN_OPEN_STRING[fingering.string];
  if (fingering.finger === 0) return pitch === open;
  return patterns.some((pattern) => open + fingerOffset(fingering.finger, pattern) === pitch);
}

/** "1st", "2nd", "3rd", "4th" ... for position labels. */
export function ordinal(n: number): string {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${suffix}`;
}

/**
 * Fraction (0 at the nut, 1 at the bridge end of the scale) of the string
 * length at which a finger stops the string `semitones` above the open string.
 * Equal temperament: the stopped length is `2^(-s/12)` of the open length.
 */
export function stopFraction(semitones: number): number {
  return 1 - 2 ** (-semitones / 12);
}

/**
 * Where a hint sits on a drawn fingerboard of `lengthPx`, measured from the
 * nut. `scalePx` is the vibrating length the drawing stands for; the drawn
 * board is shorter (only the first positions are shown), so this takes the
 * scale explicitly.
 */
export function fingerboardY(semitones: number, scalePx: number): number {
  return stopFraction(semitones) * scalePx;
}

/** The part of a violin hint that decides what is printed on the staff. */
export interface HintLike {
  string: ViolinStringName;
  finger: 0 | 1 | 2 | 3 | 4;
  position: number;
  bow?: "down" | "up";
  slur?: "start" | "end";
}

/** What is printed on one note (see the web renderer's `ViolinMarks`). */
export interface PrintedMarks {
  finger: 0 | 1 | 2 | 3 | 4;
  string?: ViolinStringName;
  position?: number;
  bow?: "down" | "up";
  slur?: "start" | "end";
}

/**
 * Decides what to print for a line of notes (in playing order) so the staff stays readable:
 *  - the finger number on every note;
 *  - the string numeral on the first note and wherever the string changes;
 *  - "Nth pos." on the first note when it is not first position, and wherever the position changes;
 *  - the bow direction and slur ends as authored.
 * `undefined` entries (rests, unhinted notes) are skipped and keep their place in the output.
 */
export function printedMarks(hints: readonly (HintLike | undefined)[]): (PrintedMarks | undefined)[] {
  let previous: HintLike | null = null;
  return hints.map((hint) => {
    if (!hint) return undefined;
    const marks: PrintedMarks = { finger: hint.finger };
    if (!previous || previous.string !== hint.string) marks.string = hint.string;
    if ((!previous && hint.position > 1) || (previous && previous.position !== hint.position)) marks.position = hint.position;
    if (hint.bow) marks.bow = hint.bow;
    if (hint.slur) marks.slur = hint.slur;
    previous = hint;
    return marks;
  });
}
