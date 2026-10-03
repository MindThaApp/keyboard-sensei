import {
  simplifyArrangement,
  type ArrangementKey,
  type ArrangementLevel,
  type ArrangementNote,
  type PlayAlongNote,
  type PracticeHands,
  type PracticeLevel,
} from "@keyboard-sensei/midi-engine";
import type { AccompanimentNote } from "./engine";
import type { BarGridEntry, BeatGridEntry, ParsedPlayAlongSong } from "./song";
import type { KeyInfo } from "./keySignature";

/**
 * Song practice: the arrangement a player is asked to play at a "Make it easier"
 * level, and the slice of it one run covers (a hand, a looped range of bars).
 *
 * Times are SONG seconds throughout. Simplification itself works in quarter-note
 * beats (see simplifyArrangement); its output is converted back through the
 * song's own tempo map (ParsedPlayAlongSong.secondsAtBeat), never with a BPM.
 */

/** Which simplifyArrangement level each "Make it easier" step uses. */
export const ARRANGEMENT_FOR_LEVEL: Record<PracticeLevel, ArrangementLevel> = {
  full: "full",
  simplified: "intermediate",
  easy: "easy",
  melody: "beginner",
};

export interface PracticeArrangement {
  level: PracticeLevel;
  /** Every note the player can be asked to play at this level, both hands, sorted by start. */
  notes: PlayAlongNote[];
  /** The original notes this level leaves out. They can still sound, quietly, as accompaniment. */
  removed: PlayAlongNote[];
  /** Where `notes` came from: the song itself, an authored easier version, or generated here. */
  source: "original" | "authored" | "generated";
}

const byStart = (a: PlayAlongNote, b: PlayAlongNote): number => a.startS - b.startS || a.midi - b.midi;
const mod12 = (n: number): number => ((n % 12) + 12) % 12;

/** A key signature as simplifyArrangement wants it: tonic pitch class + mode. */
export function arrangementKey(key: KeyInfo): ArrangementKey {
  const majorTonic = mod12(key.fifths * 7);
  return { tonic: key.mode === "minor" ? mod12(majorTonic + 9) : majorTonic, mode: key.mode };
}

/**
 * The notes to play at `level`.
 *
 * `authored` is a hand-checked easier version of the same piece (the Essentials
 * pack's Beginner / Intermediate files). It is preferred over generating one, and
 * is expected to share the song's timeline (the pack keeps each piece's own
 * tempo map). Pass it only for the level it was made for.
 */
export function arrangeForPractice(
  song: ParsedPlayAlongSong,
  level: PracticeLevel,
  authored?: ParsedPlayAlongSong | null,
): PracticeArrangement {
  if (level === "full") return { level, notes: song.notes, removed: [], source: "original" };

  if (authored) {
    const notes = [...authored.notes].sort(byStart);
    // An authored beginner version may be transposed to an easier key. Its left-out
    // notes would then clash with what the player is playing, so they stay silent.
    const sameKey = coveredShare(notes, song.notes, song) >= 0.5;
    return { level, notes, removed: sameKey ? notesNotCovered(song.notes, notes, song) : [], source: "authored" };
  }

  const input: ArrangementNote[] = song.notes.map((note, i) => ({
    midi: note.midi,
    startBeat: song.noteBeats[i]!.startBeat,
    durationBeats: song.noteBeats[i]!.durationBeats,
    hand: note.hand,
    velocity: song.noteBeats[i]!.velocity,
  }));
  const result = simplifyArrangement(
    input,
    {
      meters: song.timeSignatureSegments.map((seg) => ({ startBeat: seg.startBeat, numerator: seg.numerator, denominator: seg.denominator })),
      key: song.keys[0] ? arrangementKey(song.keys[0].key) : null,
      // Only used to decide how hard to thin fast runs.
      quarterBpm: song.bpm,
      // Played along with the original as accompaniment, so stay in the original
      // key: only whole octaves may move (into the comfortable range).
      transpose: 0,
    },
    ARRANGEMENT_FOR_LEVEL[level],
  );
  const scale = result.timeScale;
  const notes = result.notes
    .map((note) => {
      const startS = song.secondsAtBeat(note.startBeat / scale);
      const endS = song.secondsAtBeat((note.startBeat + note.durationBeats) / scale);
      return { midi: note.midi, startS, durationS: Math.max(0.05, endS - startS), hand: note.hand };
    })
    .sort(byStart);
  return { level, notes, removed: notesNotCovered(song.notes, notes, song), source: "generated" };
}

/** Length of the notated beat around `timeS`, from the song's beat grid. */
function beatLengthAt(song: ParsedPlayAlongSong, timeS: number): number {
  const beats = song.grid.beats;
  if (beats.length < 2) return 0.5;
  let lo = 0;
  let hi = beats.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (beats[mid]!.timeS <= timeS) lo = mid;
    else hi = mid;
  }
  return beats[hi]!.timeS - beats[lo]!.timeS || 0.5;
}

/**
 * Whether `note` has a partner in `others` (sorted by start): the same hand and
 * pitch class, starting within half a beat. Pitch class, because the easier levels
 * move notes by octaves; half a beat, because they also straighten rhythms.
 */
function hasPartner(note: PlayAlongNote, others: readonly PlayAlongNote[], song: ParsedPlayAlongSong): boolean {
  const tolerance = Math.min(0.4, Math.max(0.05, beatLengthAt(song, note.startS) / 2));
  let lo = 0;
  let hi = others.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (others[mid]!.startS < note.startS - tolerance) lo = mid + 1;
    else hi = mid;
  }
  const pc = mod12(note.midi);
  for (let i = lo; i < others.length && others[i]!.startS <= note.startS + tolerance; i++) {
    if (mod12(others[i]!.midi) === pc && others[i]!.hand === note.hand) return true;
  }
  return false;
}

/** The notes of `original` that `kept` (sorted by start) does not account for. */
export function notesNotCovered(original: readonly PlayAlongNote[], kept: readonly PlayAlongNote[], song: ParsedPlayAlongSong): PlayAlongNote[] {
  return original.filter((note) => !hasPartner(note, kept, song));
}

function coveredShare(notes: readonly PlayAlongNote[], original: readonly PlayAlongNote[], song: ParsedPlayAlongSong): number {
  if (notes.length === 0) return 0;
  return notes.filter((note) => hasPartner(note, original, song)).length / notes.length;
}

/** A range of bars to loop, 0-based and inclusive at both ends. */
export interface LoopRange {
  startBar: number;
  endBar: number;
}

export interface PracticeRunOptions {
  hands: PracticeHands;
  loop: LoopRange | null;
}

/**
 * Everything one run of the engine needs, in RUN time: 0 is the start of the
 * loop (or of the song), so the engine, waterfall and metronome never need to
 * know a loop exists. Add `offsetS` to get back to song time (for notation).
 */
export interface PracticeRun {
  /** The notes the player is judged on. */
  notes: PlayAlongNote[];
  accompaniment: AccompanimentNote[];
  offsetS: number;
  durationS: number;
  /** Count-in before run time 0; undefined keeps the engine's default lead-in. */
  leadInS: number | undefined;
  /** Seconds after the last note before a run ends; undefined keeps the default. */
  finishGraceS: number | undefined;
  bars: BarGridEntry[];
  beats: BeatGridEntry[];
  /** Count-in clicks, at negative run times. Empty when not looping. */
  countIn: BeatGridEntry[];
  /** The bars actually covered, clamped to the song (null when not looping). */
  loop: LoopRange | null;
}

/** A count-in shorter than this gets a second bar, so there's time to get ready. */
const MIN_COUNT_IN_S = 1.5;
/** A looped run ends as soon as its last note can no longer be judged. */
const LOOP_FINISH_GRACE_S = 0.25;

export function buildPracticeRun(song: ParsedPlayAlongSong, arrangement: PracticeArrangement, options: PracticeRunOptions): PracticeRun {
  const { hands } = options;
  const plays = (note: PlayAlongNote): boolean => hands === "both" || note.hand === hands;
  const bars = song.grid.bars;

  if (!options.loop || bars.length === 0) {
    return {
      notes: arrangement.notes.filter(plays),
      accompaniment: accompanimentFor(arrangement, plays, 0, Number.POSITIVE_INFINITY),
      offsetS: 0,
      durationS: song.durationS,
      leadInS: undefined,
      finishGraceS: undefined,
      bars,
      beats: song.grid.beats,
      countIn: [],
      loop: null,
    };
  }

  const startBar = Math.max(0, Math.min(options.loop.startBar, bars.length - 1));
  const endBar = Math.max(startBar, Math.min(options.loop.endBar, bars.length - 1));
  const startS = bars[startBar]!.timeS;
  const endS = bars[endBar + 1]?.timeS ?? song.durationS;
  const firstBarEndS = bars[startBar + 1]?.timeS ?? endS;
  const barLengthS = Math.max(0.1, firstBarEndS - startS);
  const countInBars = barLengthS < MIN_COUNT_IN_S ? 2 : 1;
  const countInS = barLengthS * countInBars;

  const inRange = (timeS: number): boolean => timeS >= startS - 1e-6 && timeS < endS - 1e-6;
  const shift = (note: PlayAlongNote): PlayAlongNote => ({
    ...note,
    startS: note.startS - startS,
    durationS: Math.min(note.durationS, endS - note.startS),
  });

  const firstBarBeats = song.grid.beats.filter((beat) => beat.timeS >= startS - 1e-6 && beat.timeS < firstBarEndS - 1e-6);
  const countIn: BeatGridEntry[] = [];
  for (let bar = 0; bar < countInBars; bar++) {
    for (const beat of firstBarBeats) countIn.push({ ...beat, timeS: beat.timeS - startS - countInS + bar * barLengthS });
  }

  return {
    notes: arrangement.notes.filter((note) => plays(note) && inRange(note.startS)).map(shift),
    accompaniment: accompanimentFor(arrangement, plays, startS, endS),
    offsetS: startS,
    durationS: endS - startS,
    leadInS: countInS,
    finishGraceS: LOOP_FINISH_GRACE_S,
    bars: bars.filter((bar) => inRange(bar.timeS)).map((bar) => ({ ...bar, timeS: bar.timeS - startS })),
    beats: song.grid.beats.filter((beat) => inRange(beat.timeS)).map((beat) => ({ ...beat, timeS: beat.timeS - startS })),
    countIn,
    loop: { startBar, endBar },
  };
}

function accompanimentFor(
  arrangement: PracticeArrangement,
  plays: (note: PlayAlongNote) => boolean,
  startS: number,
  endS: number,
): AccompanimentNote[] {
  const inRange = (note: PlayAlongNote): boolean => note.startS >= startS - 1e-6 && note.startS < endS - 1e-6;
  const toAccompaniment = (kind: AccompanimentNote["kind"]) => (note: PlayAlongNote): AccompanimentNote => ({
    midi: note.midi,
    startS: note.startS - startS,
    durationS: Math.min(note.durationS, endS - note.startS),
    kind,
  });
  return [
    ...arrangement.notes.filter((note) => !plays(note) && inRange(note)).map(toAccompaniment("otherHand")),
    ...arrangement.removed.filter(inRange).map(toAccompaniment("removed")),
  ];
}
