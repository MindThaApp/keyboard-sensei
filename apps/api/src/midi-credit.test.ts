import { Midi } from "@tonejs/midi";
import { describe, expect, it } from "vitest";
import { MidiStructureError, embedCopyright, readCopyrightNotices, toAscii } from "./midi-credit.js";

const sample = (): Buffer => {
  const midi = new Midi();
  const a = midi.addTrack();
  const b = midi.addTrack();
  for (let i = 0; i < 20; i += 1) a.addNote({ midi: 60 + i, time: i * 0.25, duration: 0.2, velocity: 0.6 });
  for (let i = 0; i < 10; i += 1) b.addNote({ midi: 40 + i, time: i * 0.5, duration: 0.4 });
  return Buffer.from(midi.toArray());
};
const notes = (bytes: Buffer) => new Midi(bytes).tracks.map((t) => t.notes.map((n) => [n.midi, n.ticks, n.durationTicks, n.velocity]));

/** One-track SMF from raw event bytes (deltas included), with an end-of-track appended. */
const smf = (events: number[]): Buffer => {
  const body = [...events, 0x00, 0xff, 0x2f, 0x00];
  return Buffer.concat([
    Buffer.from("MThd", "latin1"), Buffer.from([0, 0, 0, 6, 0, 0, 0, 1, 0, 96]),
    Buffer.from("MTrk", "latin1"), Buffer.from([0, 0, 0, body.length]), Buffer.from(body),
  ]);
};

describe("embedCopyright", () => {
  it("adds exactly one copyright event at tick 0 of the first track and keeps everything else", () => {
    const original = sample();
    const out = embedCopyright(original, "Nocturne (Chopin). Licence: cc-by-sa-4.0");
    expect(readCopyrightNotices(out)).toEqual(["Nocturne (Chopin). Licence: cc-by-sa-4.0"]);
    expect(notes(out)).toEqual(notes(original));
    // Byte-level: header and second track identical, first track = new event + the old events.
    const event = Buffer.from([0x00, 0xff, 0x02, "Nocturne (Chopin). Licence: cc-by-sa-4.0".length, ...Buffer.from("Nocturne (Chopin). Licence: cc-by-sa-4.0")]);
    const firstTrackAt = original.indexOf("MTrk");
    expect(out.subarray(0, firstTrackAt).equals(original.subarray(0, firstTrackAt))).toBe(true);
    const oldLen = original.readUInt32BE(firstTrackAt + 4);
    expect(out.readUInt32BE(firstTrackAt + 4)).toBe(oldLen + event.length);
    expect(out.subarray(firstTrackAt + 8, firstTrackAt + 8 + event.length).equals(event)).toBe(true);
    const oldBody = original.subarray(firstTrackAt + 8, firstTrackAt + 8 + oldLen);
    expect(out.subarray(firstTrackAt + 8 + event.length).equals(Buffer.concat([oldBody, original.subarray(firstTrackAt + 8 + oldLen)]))).toBe(true);
  });

  it("replaces existing copyright events (any track, any tick) without moving later events", () => {
    const old = [0x00, 0xff, 0x02, 3, 0x6f, 0x6c, 0x64];
    const later = [0x30, 0xff, 0x02, 3, 0x6f, 0x6c, 0x64]; // old notice at delta 0x30
    const note = [0x10, 0x90, 60, 64, 0x20, 0x80, 60, 0];
    const original = smf([...old, ...note, ...later, 0x05, 0x90, 62, 64]);
    expect(readCopyrightNotices(original)).toHaveLength(2);
    const out = embedCopyright(original, "New credit");
    expect(readCopyrightNotices(out)).toEqual(["New credit"]);
    // The event after the removed one absorbs its 0x30 delta (5 + 0x30 = 0x35); notes are identical.
    expect(out.includes(Buffer.from([0x35, 0x90, 62, 64]))).toBe(true);
    expect(notes(out)).toEqual(notes(original));
  });

  it("preserves running status and meta events around the insertion", () => {
    const original = smf([0x00, 0xff, 0x51, 3, 0x07, 0xa1, 0x20, 0x00, 0x90, 60, 64, 0x10, 62, 64, 0x10, 0x80, 60, 0]);
    const out = embedCopyright(original, "x");
    expect(out.includes(Buffer.from([0x00, 0x90, 60, 64, 0x10, 62, 64, 0x10, 0x80, 60, 0]))).toBe(true);
    expect(notes(out)).toEqual(notes(original));
  });

  it("is idempotent in effect and handles long credits", () => {
    const long = "A".repeat(300);
    const once = embedCopyright(sample(), long);
    expect(readCopyrightNotices(once)).toEqual([long]);
    const twice = embedCopyright(once, long);
    expect(twice.equals(once)).toBe(true);
  });

  it("rejects non-MIDI and truncated input", () => {
    expect(() => embedCopyright(Buffer.from("nope"), "x")).toThrow(MidiStructureError);
    const ok = sample();
    expect(() => embedCopyright(ok.subarray(0, ok.length - 5), "x")).toThrow(MidiStructureError);
  });
});

describe("toAscii", () => {
  it("transliterates to 7-bit ASCII", () => {
    expect(toAscii("Bernd Krüger © 2008 – “Fantaisie”")).toBe('Bernd Kruger (c) 2008 - "Fantaisie"');
    expect(toAscii("日本\n語")).toBe("?? ?");
    expect(/^[\x20-\x7e]*$/.test(toAscii("Dvořák ñ ø æ ™"))).toBe(true);
  });
});
