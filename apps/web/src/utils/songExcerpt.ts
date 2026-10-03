import type { ExpectedNoteEvent, MidiExercise } from "@keyboard-sensei/shared-types";
import { ELEMENTARY_CONFIG, INTERMEDIATE_CONFIG, BEGINNER_CONFIG } from "@keyboard-sensei/midi-engine";
import type { ParsedPlayAlongSong } from "./playalongSong";
import type { PlayAlongNote } from "@keyboard-sensei/midi-engine";

export type PracticeHand = "right" | "left" | "both";

export interface ExcerptOptions {
  /** First bar of the excerpt (0-based index into grid.bars). */
  startBar: number;
  /** How many bars to practise. */
  barCount: number;
  /** Which hand you play. The other hand becomes accompaniment. */
  hand: PracticeHand;
  /** The library's 1-5 density rating, used to pick scoring tolerances. */
  songDifficulty: number;
}

export interface SongExcerpt {
  exercise: MidiExercise;
  /** Notes the OTHER hand plays for you, in seconds relative to the excerpt start. */
  accompaniment: { midi: number; startS: number; durationS: number }[];
  startS: number;
  endS: number;
  /** True when this excerpt's tempo is steady enough for beat-based scoring to mean anything. */
  reliable: boolean;
}

/**
 * Turn a slice of a real song into a scored exercise.
 *
 * The subtlety: MidiExercise measures everything in BEATS against a single
 * tempoBpm, but a real MIDI can have a tempo map. Converting with a fixed
 * `seconds -> beats` factor would smear every note in a rubato piece.
 *
 * So beats are read off the song's own beat GRID (built from the full tempo map)
 * rather than computed from a BPM. `beatAt()` interpolates between grid beats, so
 * a note lands on the beat the musician actually plays it on, whatever the tempo
 * is doing. `tempoBpm` is then the excerpt's MEAN beat rate — used only to turn
 * those beats back into expected milliseconds at playback time.
 */
export function buildSongExcerpt(song: ParsedPlayAlongSong, options: ExcerptOptions): SongExcerpt | null {
  const { bars, beats } = song.grid;
  if (bars.length === 0 || beats.length < 2) return null;

  const startBar = Math.max(0, Math.min(options.startBar, bars.length - 1));
  const endBarIndex = Math.min(startBar + options.barCount, bars.length - 1);
  const startS = bars[startBar]!.timeS;
  const endS = endBarIndex < bars.length ? bars[endBarIndex]!.timeS : song.durationS;
  if (endS <= startS) return null;

  /** Fractional beat position of a time, interpolated on the song's own grid. */
  const beatAt = (timeS: number): number => {
    if (timeS <= beats[0]!.timeS) return 0;
    const last = beats.length - 1;
    if (timeS >= beats[last]!.timeS) {
      // Past the final beat: extrapolate using the final beat's own length.
      const span = beats[last]!.timeS - beats[last - 1]!.timeS || 1;
      return last + (timeS - beats[last]!.timeS) / span;
    }
    // Binary search for the beat this time falls inside.
    let lo = 0;
    let hi = last;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (beats[mid]!.timeS <= timeS) lo = mid;
      else hi = mid;
    }
    const span = beats[hi]!.timeS - beats[lo]!.timeS || 1;
    return lo + (timeS - beats[lo]!.timeS) / span;
  };

  const originBeat = beatAt(startS);
  const inRange = (note: PlayAlongNote) => note.startS >= startS - 1e-6 && note.startS < endS - 1e-6;

  const practised = song.notes.filter(
    (note) => inRange(note) && (options.hand === "both" || note.hand === options.hand),
  );
  if (practised.length === 0) return null;

  const accompaniment =
    options.hand === "both"
      ? []
      : song.notes
          .filter((note) => inRange(note) && note.hand !== options.hand)
          .map((note) => ({ midi: note.midi, startS: note.startS - startS, durationS: note.durationS }));

  // Notes struck together (within a 60ms window) are one chord, so the scorer
  // judges them as a chord rather than as separate late/early notes.
  const sorted = [...practised].sort((a, b) => a.startS - b.startS || a.midi - b.midi);
  const chordOf = new Map<PlayAlongNote, string>();
  let groupStart = -Infinity;
  let groupId = "";
  let groupSize = 0;
  const groupMembers: PlayAlongNote[][] = [];
  for (const note of sorted) {
    if (note.startS - groupStart > 0.06) {
      groupStart = note.startS;
      groupId = `chord-${groupMembers.length}`;
      groupMembers.push([note]);
      groupSize = 1;
    } else {
      groupMembers[groupMembers.length - 1]!.push(note);
      groupSize++;
    }
    chordOf.set(note, groupId);
    void groupSize;
  }
  const realChord = new Set(groupMembers.filter((g) => g.length > 1).map((g) => chordOf.get(g[0]!)!));

  const expected: ExpectedNoteEvent[] = sorted.map((note, index) => {
    const startBeat = beatAt(note.startS) - originBeat;
    const endBeat = beatAt(note.startS + note.durationS) - originBeat;
    const id = chordOf.get(note)!;
    return {
      id: `x${index}`,
      note: note.midi,
      startBeat,
      durationBeats: Math.max(0.125, endBeat - startBeat),
      hand: note.hand,
      finger: null,
      chordGroupId: realChord.has(id) ? id : null,
      voice: note.hand === "left" ? "bass" : "melody",
    };
  });

  // Mean beat length across the excerpt, converted to BPM. This is the only place
  // a single tempo number appears, and it's derived, not assumed.
  const totalBeats = beatAt(endS) - originBeat;
  const tempoBpm = totalBeats > 0 ? Math.round((totalBeats * 60) / (endS - startS)) : 100;

  // A wildly varying tempo makes "beats" a shaky basis for timing judgement.
  // clickSafe already measures exactly that instability, so reuse it.
  const reliable = song.grid.clickSafe;

  const config =
    options.songDifficulty >= 4 ? INTERMEDIATE_CONFIG : options.songDifficulty >= 2 ? ELEMENTARY_CONFIG : BEGINNER_CONFIG;

  return {
    exercise: {
      exerciseId: `excerpt-${startBar}-${endBarIndex}-${options.hand}`,
      tempoBpm: Math.max(20, Math.min(240, tempoBpm)),
      difficulty: options.songDifficulty >= 4 ? "advanced" : options.songDifficulty >= 2 ? "intermediate" : "beginner",
      ...config,
      // startBeat/durationBeats above count NOTATED beats off the grid (eighths
      // in 6/8), so the meter must be stated in the same unit — song.beatsPerBar
      // is in quarter notes, which put 6/8 barlines every three eighths.
      beatsPerBar: bars[startBar]!.numerator,
      beatUnit: bars[startBar]!.denominator,
      expected,
    },
    accompaniment,
    startS,
    endS,
    reliable,
  };
}
