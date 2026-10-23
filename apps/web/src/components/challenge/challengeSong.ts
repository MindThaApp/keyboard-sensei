import { Midi } from "@tonejs/midi";
import type { ChallengePiece } from "@keyboard-sensei/challenge-gen";
import { buildPracticeRun, parsePlayAlongSong, type ParsedPlayAlongSong, type PracticeArrangement, type PracticeRun } from "@keyboard-sensei/playalong-core";

/**
 * The challenge piece as a MIDI file, then through the same parser every song uses,
 * so the tempo map, beat grid, key signature and hands come out exactly as they would
 * for a library song and the play-along engine, waterfall and notation need no
 * special case.
 */

// @tonejs/midi names a key signature by its major key, with the mode beside it
// (A minor is { key: "C", scale: "minor" }).
const MAJOR_KEY_BY_FIFTHS = ["Cb", "Gb", "Db", "Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E", "B", "F#", "C#"];

export function challengeMidi(piece: ChallengePiece): Midi {
  const midi = new Midi();
  const ppq = midi.header.ppq;
  midi.header.setTempo(piece.tempoBpm);
  midi.header.timeSignatures.push({ ticks: 0, timeSignature: [piece.beatsPerBar, 4] });
  midi.header.keySignatures.push({ ticks: 0, key: MAJOR_KEY_BY_FIFTHS[piece.key.fifths + 7]!, scale: piece.key.mode });
  midi.header.update();

  // One track per hand: the parser makes the lower track the left hand.
  for (const hand of ["right", "left"] as const) {
    const notes = piece.notes.filter((note) => note.hand === hand);
    if (notes.length === 0) continue;
    const track = midi.addTrack();
    track.name = hand === "right" ? "Right hand" : "Left hand";
    for (const note of notes) {
      track.addNote({
        midi: note.midi,
        ticks: Math.round(note.startBeat * ppq),
        durationTicks: Math.round(note.durationBeats * ppq),
        velocity: hand === "right" ? 0.8 : 0.6,
      });
    }
  }
  return midi;
}

export function challengeSong(piece: ChallengePiece): ParsedPlayAlongSong {
  const bytes = challengeMidi(piece).toArray();
  const song = parsePlayAlongSong(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  // The parser second-guesses a declared C major (most library files say C major when
  // nobody set a key) and takes the mode from the notes. Here the key is known.
  return { ...song, keys: [{ startBeat: 0, startS: 0, key: { fifths: piece.key.fifths, mode: piece.key.mode } }] };
}

/** The whole piece, both hands, as one run of the engine. */
export function challengeRun(song: ParsedPlayAlongSong): { arrangement: PracticeArrangement; run: PracticeRun } {
  const arrangement: PracticeArrangement = { level: "full", notes: song.notes, removed: [], source: "original" };
  return { arrangement, run: buildPracticeRun(song, arrangement, { hands: "both", loop: null }) };
}
