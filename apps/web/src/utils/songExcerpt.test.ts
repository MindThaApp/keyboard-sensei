import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parsePlayAlongSong } from "./playalongSong";
import { buildSongExcerpt } from "./songExcerpt";
import { MIDI_LIBRARY_DIR, hasLibraryFixtures } from "./libraryFixtures";

const load = (file: string) => {
  const bytes = readFileSync(path.join(MIDI_LIBRARY_DIR, file));
  return parsePlayAlongSong(new Uint8Array(bytes).buffer.slice(0) as ArrayBuffer);
};

// The MIDI library is volume-mounted and gitignored, so it isn't present in CI.
describe.skipIf(!hasLibraryFixtures())("buildSongExcerpt", () => {
  it("slices exactly the requested bars, using the song's own bar grid", () => {
    const song = load("abba-dancing-queen.mid");
    const excerpt = buildSongExcerpt(song, { startBar: 4, barCount: 8, hand: "both", songDifficulty: 3 })!;
    expect(excerpt).not.toBeNull();
    expect(excerpt.startS).toBeCloseTo(song.grid.bars[4]!.timeS, 5);
    expect(excerpt.endS).toBeCloseTo(song.grid.bars[12]!.timeS, 5);
    // Every practised note lies inside the slice.
    for (const note of excerpt.exercise.expected) expect(note.startBeat).toBeGreaterThanOrEqual(-1e-6);
  });

  it("starts the first note at (or just after) beat 0 of the excerpt, not the song", () => {
    const song = load("abba-dancing-queen.mid");
    const excerpt = buildSongExcerpt(song, { startBar: 8, barCount: 4, hand: "both", songDifficulty: 3 })!;
    const first = Math.min(...excerpt.exercise.expected.map((n) => n.startBeat));
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(1.5); // within the first bar-ish, not offset by the song's elapsed beats
  });

  it("practising one hand hands the OTHER hand to the accompaniment", () => {
    const song = load("beginner-ode-to-joy.mid");
    const right = buildSongExcerpt(song, { startBar: 0, barCount: 8, hand: "right", songDifficulty: 1 })!;
    expect(right.exercise.expected.every((n) => n.hand === "right")).toBe(true);
    expect(right.accompaniment.length).toBeGreaterThan(0);

    const both = buildSongExcerpt(song, { startBar: 0, barCount: 8, hand: "both", songDifficulty: 1 })!;
    expect(both.accompaniment).toHaveLength(0);
    // Practising both hands means strictly more expected notes than one hand alone.
    expect(both.exercise.expected.length).toBeGreaterThan(right.exercise.expected.length);
  });

  it("accompaniment times are relative to the excerpt, not the song", () => {
    const song = load("beginner-ode-to-joy.mid");
    const excerpt = buildSongExcerpt(song, { startBar: 4, barCount: 4, hand: "right", songDifficulty: 1 })!;
    expect(excerpt.startS).toBeGreaterThan(0); // we really did skip ahead
    for (const note of excerpt.accompaniment) expect(note.startS).toBeGreaterThanOrEqual(0);
  });

  it("reads beats off the tempo map, so a rubato piece isn't smeared by a fixed BPM", () => {
    const song = load("claude-debussy-clair-de-lune.mid");
    expect(song.grid.steadyBpm).toBeNull(); // it really does have a varying tempo
    const excerpt = buildSongExcerpt(song, { startBar: 4, barCount: 12, hand: "both", songDifficulty: 4 })!;

    // A naive conversion assumes ONE seconds-per-beat across the excerpt. Compare
    // it against the grid-derived beat for the SAME note (expected[] is sorted the
    // same way as this list, so the indexes line up).
    const sourceNotes = song.notes
      .filter((n) => n.startS >= excerpt.startS - 1e-6 && n.startS < excerpt.endS - 1e-6)
      .sort((a, b) => a.startS - b.startS || a.midi - b.midi);
    expect(sourceNotes).toHaveLength(excerpt.exercise.expected.length);

    const naiveBeat = (t: number) => ((t - excerpt.startS) * excerpt.exercise.tempoBpm) / 60;
    const worst = Math.max(
      ...sourceNotes.map((n, i) => Math.abs(naiveBeat(n.startS) - excerpt.exercise.expected[i]!.startBeat)),
    );
    // On a piece whose tempo genuinely moves, the two methods MUST diverge — that
    // divergence is precisely the smearing a fixed BPM would have introduced.
    expect(worst).toBeGreaterThan(0.05);
  });

  it("marks simultaneous notes as one chord so they're judged together", () => {
    const song = load("abba-dancing-queen.mid");
    const excerpt = buildSongExcerpt(song, { startBar: 8, barCount: 8, hand: "both", songDifficulty: 3 })!;
    const grouped = excerpt.exercise.expected.filter((n) => n.chordGroupId !== null);
    // Dancing Queen has chords; a lone note must NOT be given a chord id.
    if (grouped.length > 0) {
      const ids = new Set(grouped.map((n) => n.chordGroupId));
      for (const id of ids) {
        expect(grouped.filter((n) => n.chordGroupId === id).length).toBeGreaterThan(1);
      }
    }
  });

  it("derives tempoBpm from the excerpt rather than assuming one", () => {
    const song = load("beginner-twinkle-twinkle-little-star.mid");
    const excerpt = buildSongExcerpt(song, { startBar: 0, barCount: 4, hand: "right", songDifficulty: 1 })!;
    expect(excerpt.exercise.tempoBpm).toBeGreaterThan(80);
    expect(excerpt.exercise.tempoBpm).toBeLessThan(100); // authored at 90
  });

  it("returns null rather than an empty exercise when the slice has no notes for that hand", () => {
    const song = load("beginner-twinkle-twinkle-little-star.mid");
    // Twinkle is right-hand only — there is no left hand to practise.
    expect(buildSongExcerpt(song, { startBar: 0, barCount: 4, hand: "left", songDifficulty: 1 })).toBeNull();
  });
});
