import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import ToneMidi from "@tonejs/midi";
import { incipitMatches, loadSource, sameNotes, sourceNotes, unzipMember } from "./build.js";
import { AUTHORED_SCORES } from "./authored/index.js";
import { ESSENTIALS, attribution, contentRights, incipitPitches, isAuthored, parsePitch } from "./manifest.js";
import { ESSENTIALS_REPLACES } from "./replacements.js";

const { Midi } = ToneMidi;

describe("Essentials manifest", () => {
  it("has unique slugs and ranks 1..N", () => {
    expect(new Set(ESSENTIALS.map((piece) => piece.slug)).size).toBe(ESSENTIALS.length);
    expect(ESSENTIALS.map((piece) => piece.rank).sort((a, b) => a - b)).toEqual(ESSENTIALS.map((_, i) => i + 1));
  });

  it("pins every Mutopia source to a URL and sha256, with a licence and attribution", () => {
    for (const piece of ESSENTIALS) {
      const { source } = piece;
      if (isAuthored(source)) continue;
      expect(source.url).toMatch(/^https:\/\/www\.mutopiaproject\.org\/ftp\/.+\.(mid|zip)$/);
      expect(source.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(source.url.endsWith(".zip")).toBe(Boolean(source.member));
      expect(source.mutopiaId).toMatch(/^Mutopia-\d{4}\/\d{2}\/\d{2}-\d+$/);
      expect(attribution(piece)).toContain(source.mutopiaId);
      expect(contentRights(piece)).toMatch(/^(public-domain|cc-by(-sa)?-\d\.\d)$/);
    }
  });

  it("gives every authored piece a score, a basis and two independent sources for its tune", () => {
    for (const piece of ESSENTIALS) {
      const { source } = piece;
      if (!isAuthored(source)) continue;
      expect(AUTHORED_SCORES[piece.slug], piece.slug).toBeDefined();
      expect(source.basis.length, piece.slug).toBeGreaterThan(20);
      expect(source.verification.length, piece.slug).toBeGreaterThan(20);
      const hosts = new Set(source.verifiedAgainst.map((ref) => new URL(ref.url).host));
      expect(hosts.size, `${piece.slug}: sources on two different sites`).toBeGreaterThanOrEqual(2);
      expect(contentRights(piece)).toBe("public-domain");
      expect(attribution(piece)).toContain("arranged for Keyboard Sensei");
    }
    const authored = new Set(ESSENTIALS.filter((piece) => isAuthored(piece.source)).map((piece) => piece.slug));
    expect(Object.keys(AUTHORED_SCORES).filter((slug) => !authored.has(slug))).toEqual([]);
  });

  it("has an incipit for every piece in spellable pitches: 7–16 notes, or 16+ for an authored tune", () => {
    for (const piece of ESSENTIALS) {
      const pitches = incipitPitches(piece);
      expect(pitches.length, piece.slug).toBeGreaterThanOrEqual(isAuthored(piece.source) ? 16 : 7);
      expect(pitches.length, piece.slug).toBeLessThanOrEqual(isAuthored(piece.source) ? 32 : 16);
      for (const pitch of pitches) expect(pitch).toBeGreaterThanOrEqual(21);
    }
    expect(parsePitch("C4")).toBe(60);
    expect(parsePitch("C#4")).toBe(parsePitch("Db4"));
    expect(parsePitch("Bb3")).toBe(58);
  });

  it("maps replacements only from real Essentials slugs to real library ids", () => {
    const slugs = new Set(ESSENTIALS.map((piece) => piece.slug));
    const manifestPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../scripts/midi-manifest.json");
    const libraryIds = new Set((JSON.parse(readFileSync(manifestPath, "utf8")) as { id: string }[]).map((entry) => entry.id));
    const seen = new Set<string>();
    for (const [slug, replacement] of Object.entries(ESSENTIALS_REPLACES)) {
      expect(slugs.has(slug), slug).toBe(true);
      for (const id of replacement.library ?? []) {
        expect(libraryIds.has(id), id).toBe(true);
        expect(seen.has(id), `${id} replaced twice`).toBe(false);
        seen.add(id);
      }
    }
  });
});

describe("source loading", () => {
  const base = ESSENTIALS.find((piece) => piece.slug === "moonlight-sonata-1")!;
  /** A one-track file: a triplet-eighth figure under a held tune note. */
  function file(bpm: number | null): Buffer {
    const midi = new Midi();
    if (bpm !== null) midi.header.setTempo(bpm);
    midi.header.update();
    const track = midi.addTrack();
    const ppq = midi.header.ppq;
    for (let i = 0; i < 6; i++) track.addNote({ midi: 64 + (i % 3), ticks: (i * ppq) / 3, durationTicks: Math.round(ppq / 3) - 1 });
    track.addNote({ midi: 72, ticks: 0, durationTicks: ppq * 2 });
    return Buffer.from(midi.toArray());
  }

  it("applies tempoBpm only over LilyPond's default tempo", () => {
    const piece = { ...base, tempoBpm: 160 };
    expect(loadSource(file(60), piece).header.tempos[0].bpm).toBe(160);
    expect(loadSource(file(null), piece).header.tempos[0].bpm).toBe(160);
    expect(() => loadSource(file(72), piece)).toThrow(/own tempo/);
    expect(loadSource(file(72), { ...base, tempoBpm: undefined }).header.tempos[0].bpm).toBeCloseTo(72);
  });

  it("never marks the accompaniment figure as melody", () => {
    const piece = { ...base, tempoBpm: undefined, tracks: undefined };
    const notes = sourceNotes(loadSource(file(60), piece), piece);
    expect(notes.filter((note) => note.melody).map((note) => note.midi)).toEqual([72]);
    const unmarked = sourceNotes(loadSource(file(60), piece), { ...piece, accompanimentDurationBeats: undefined });
    expect(unmarked.some((note) => note.melody)).toBe(false);
  });

  it("recognises a level that is note-for-note the level above it", () => {
    const a = [{ midi: 60, startBeat: 0, durationBeats: 1, hand: "right" as const }];
    expect(sameNotes(a, [{ ...a[0], hand: "left" }])).toBe(true);
    expect(sameNotes(a, [{ ...a[0], durationBeats: 0.5 }])).toBe(false);
  });
});

describe("incipitMatches", () => {
  const incipit = [64, 63, 64, 63, 64, 59, 62, 60, 57];

  it("requires the Full version to match exactly", () => {
    expect(incipitMatches([...incipit, 48], incipit, true).ok).toBe(true);
    expect(incipitMatches([64, 63, 64, 63, 64, 59, 62, 60, 59], incipit, true).ok).toBe(false);
  });

  it("lets a simplified version drop notes but not change them", () => {
    expect(incipitMatches([64, 64, 64, 59, 62, 60, 57], incipit, false).ok).toBe(true); // 7/9 kept
    expect(incipitMatches([64, 64, 59, 57], incipit, false).ok).toBe(false); // too thin
    expect(incipitMatches([65, 63, 64, 63, 64, 59, 62, 60, 57], incipit, false).ok).toBe(false); // wrong first note
    expect(incipitMatches([64, 63, 64, 61, 64, 59, 62, 60, 57], incipit, false).matched).toBeLessThan(9);
  });

  it("accepts a whole-octave move and single notes folded by an octave", () => {
    expect(incipitMatches(incipit.map((p) => p + 24), incipit, false).ok).toBe(true);
    expect(incipitMatches([64, 63, 64, 63, 64, 59, 62, 60, 69], incipit, false).ok).toBe(true);
  });
});

describe("unzipMember", () => {
  /** A minimal zip with one deflated and one stored entry. */
  function zip(entries: { name: string; data: Buffer; deflate: boolean }[]): Buffer {
    const locals: Buffer[] = [];
    const centrals: Buffer[] = [];
    let offset = 0;
    for (const entry of entries) {
      const body = entry.deflate ? deflateRawSync(entry.data) : entry.data;
      const name = Buffer.from(entry.name);
      const local = Buffer.alloc(30);
      local.writeUInt32LE(0x04034b50, 0);
      local.writeUInt16LE(entry.deflate ? 8 : 0, 8);
      local.writeUInt32LE(body.length, 18);
      local.writeUInt32LE(entry.data.length, 22);
      local.writeUInt16LE(name.length, 26);
      const central = Buffer.alloc(46);
      central.writeUInt32LE(0x02014b50, 0);
      central.writeUInt16LE(entry.deflate ? 8 : 0, 10);
      central.writeUInt32LE(body.length, 20);
      central.writeUInt32LE(entry.data.length, 24);
      central.writeUInt16LE(name.length, 28);
      central.writeUInt32LE(offset, 42);
      locals.push(local, name, body);
      centrals.push(central, name);
      offset += 30 + name.length + body.length;
    }
    const centralDir = Buffer.concat(centrals);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(centralDir.length, 12);
    end.writeUInt32LE(offset, 16);
    return Buffer.concat([...locals, centralDir, end]);
  }

  it("extracts stored and deflated members by name", () => {
    const archive = zip([
      { name: "a/one.mid", data: Buffer.from("first file"), deflate: true },
      { name: "a/two.mid", data: Buffer.from("second file"), deflate: false },
    ]);
    expect(unzipMember(archive, "one.mid").toString()).toBe("first file");
    expect(unzipMember(archive, "two.mid").toString()).toBe("second file");
    expect(() => unzipMember(archive, "three.mid")).toThrow(/not found/);
  });
});
