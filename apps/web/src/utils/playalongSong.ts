import { Midi } from "@tonejs/midi";
import type { PlayAlongNote } from "@keyboard-sensei/midi-engine";

export interface ParsedPlayAlongSong {
  notes: PlayAlongNote[];
  durationS: number;
  pitchMin: number;
  pitchMax: number;
}

const PIANO_MIN = 21;
const PIANO_MAX = 108;

/**
 * Parse raw MIDI bytes into play-along notes (song seconds, tempo map already
 * applied by @tonejs/midi). Hand assignment: with 2+ note-bearing tracks the
 * lowest-mean-pitch track is the left hand; single-track songs split at
 * middle C.
 */
export function parsePlayAlongSong(bytes: ArrayBuffer): ParsedPlayAlongSong {
  const midi = new Midi(bytes);
  const noteTracks = midi.tracks.filter((track) => track.notes.length > 0);

  let leftTrackIndex = -1;
  if (noteTracks.length >= 2) {
    let lowestMean = Number.POSITIVE_INFINITY;
    noteTracks.forEach((track, index) => {
      const mean = track.notes.reduce((sum, note) => sum + note.midi, 0) / track.notes.length;
      if (mean < lowestMean) {
        lowestMean = mean;
        leftTrackIndex = index;
      }
    });
  }

  const notes: PlayAlongNote[] = noteTracks
    .flatMap((track, index) =>
      track.notes
        .filter((note) => note.midi >= PIANO_MIN && note.midi <= PIANO_MAX)
        .map((note) => ({
          midi: note.midi,
          startS: note.time,
          durationS: note.duration,
          hand: (noteTracks.length >= 2 ? (index === leftTrackIndex ? "left" : "right") : note.midi < 60 ? "left" : "right") as
            | "left"
            | "right",
        })),
    )
    .sort((a, b) => a.startS - b.startS || a.midi - b.midi);

  if (notes.length === 0) throw new Error("No playable piano notes in this MIDI file");

  let pitchMin = PIANO_MAX;
  let pitchMax = PIANO_MIN;
  for (const note of notes) {
    pitchMin = Math.min(pitchMin, note.midi);
    pitchMax = Math.max(pitchMax, note.midi);
  }

  return { notes, durationS: midi.duration, pitchMin, pitchMax };
}
