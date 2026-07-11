import { describe, expect, it } from "vitest";
import { Midi } from "@tonejs/midi";
import { parsePlayAlongSong } from "./playalongSong";

describe("parsePlayAlongSong", () => {
  it("assigns hands by track mean pitch for two-track files", () => {
    const midi = new Midi();
    const right = midi.addTrack();
    const left = midi.addTrack();
    for (let i = 0; i < 4; i++) {
      right.addNote({ midi: 72 + i, time: i, duration: 0.5 });
      left.addNote({ midi: 48 + i, time: i + 0.1, duration: 0.5 });
    }
    const song = parsePlayAlongSong(new Uint8Array(midi.toArray()).buffer as ArrayBuffer);
    expect(song.notes).toHaveLength(8);
    for (const note of song.notes) {
      expect(note.hand).toBe(note.midi >= 72 ? "right" : "left");
    }
    expect(song.pitchMin).toBe(48);
    expect(song.pitchMax).toBe(75);
  });

  it("splits single-track files at middle C and sorts by start time", () => {
    const midi = new Midi();
    const track = midi.addTrack();
    track.addNote({ midi: 55, time: 1, duration: 0.5 });
    track.addNote({ midi: 65, time: 0.5, duration: 0.5 });
    const song = parsePlayAlongSong(new Uint8Array(midi.toArray()).buffer as ArrayBuffer);
    expect(song.notes.map((note) => note.midi)).toEqual([65, 55]); // sorted by startS
    expect(song.notes[0].hand).toBe("right");
    expect(song.notes[1].hand).toBe("left");
  });

  it("throws on files without piano-range notes", () => {
    const midi = new Midi();
    const track = midi.addTrack();
    track.addNote({ midi: 115, time: 0, duration: 1 });
    expect(() => parsePlayAlongSong(new Uint8Array(midi.toArray()).buffer as ArrayBuffer)).toThrow(/No playable/);
  });

  it("extracts tempo and time signature from the MIDI header, defaulting when absent", () => {
    const midi = new Midi();
    midi.header.setTempo(90);
    midi.header.timeSignatures.push({ ticks: 0, timeSignature: [3, 4] });
    const track = midi.addTrack();
    track.addNote({ midi: 60, time: 0, duration: 0.5 });
    const song = parsePlayAlongSong(new Uint8Array(midi.toArray()).buffer as ArrayBuffer);
    expect(song.bpm).toBeCloseTo(90, 0);
    expect(song.beatsPerBar).toBe(3);
  });

  it("defaults bpm and beatsPerBar when the header has none", () => {
    const midi = new Midi();
    const track = midi.addTrack();
    track.addNote({ midi: 60, time: 0, duration: 0.5 });
    const song = parsePlayAlongSong(new Uint8Array(midi.toArray()).buffer as ArrayBuffer);
    expect(song.bpm).toBeGreaterThan(0);
    expect(song.beatsPerBar).toBe(4);
  });
});
