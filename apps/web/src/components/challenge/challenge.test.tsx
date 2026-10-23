/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { CHALLENGE_TIERS, generateChallenge, pieceFingerprint } from "@keyboard-sensei/challenge-gen";
import ScrollingScore, { buildQuarterBeatAnchors, engraveSong } from "../play/ScrollingScore";
import { challengeRun, challengeSong } from "./challengeSong";
import { rowTier } from "./DailyChallengeRow";
import type { ChallengeTierState, ChallengeTodayResponse } from "./challengeApi";

const DAY_MS = 86_400_000;
const dates = (first: string, count: number) =>
  Array.from({ length: count }, (_, i) => new Date(Date.parse(`${first}T00:00:00Z`) + i * DAY_MS).toISOString().slice(0, 10));

describe("daily challenge on the client", () => {
  it("generates the same notes as the server for the pinned day (see the API suite)", () => {
    expect(CHALLENGE_TIERS.map((tier) => pieceFingerprint(generateChallenge("2026-10-23", tier)))).toEqual([
      "F/70/1510d2d2",
      "G/85/e8ea599b",
      "D/106/153be8cb",
    ]);
  });

  it("survives the MIDI round trip: every note, hand, beat and the key come back", () => {
    for (const date of dates("2026-10-01", 30)) {
      for (const tier of CHALLENGE_TIERS) {
        const piece = generateChallenge(date, tier);
        const song = challengeSong(piece);
        expect(song.notes).toHaveLength(piece.notes.length);
        expect(song.grid.bars).toHaveLength(8);
        expect(song.keys[0]!.key).toEqual({ fifths: piece.key.fifths, mode: piece.key.mode });
        const expected = piece.notes.map((note) => `${note.hand}:${note.midi}:${note.startBeat}`).sort();
        const parsed = song.notes.map((note, i) => `${note.hand}:${note.midi}:${song.noteBeats[i]!.startBeat}`).sort();
        expect(parsed).toEqual(expected);
        const { run } = challengeRun(song);
        expect(run.notes).toHaveLength(piece.notes.length);
        // The run ends with the last note; the closing half-bar rest isn't played out.
        const lastBeat = Math.max(...piece.notes.map((note) => note.startBeat + note.durationBeats));
        expect(run.durationS).toBeCloseTo((lastBeat * 60) / piece.tempoBpm, 3);
      }
    }
  });

  it("engraves every tier on the scrolling score, every note on its own beat (a year)", () => {
    for (const date of dates("2026-01-01", 365)) {
      for (const tier of CHALLENGE_TIERS) {
        const piece = generateChallenge(date, tier);
        const song = challengeSong(piece);
        const anchors = buildQuarterBeatAnchors(song.grid, song.timeSignatureSegments);
        const { scrollNotes } = engraveSong(song.notes, anchors, song.timeSignatureSegments, song.keys, song.grid.bars.length);
        const expected = piece.notes.map((note) => `${note.midi}@${note.startBeat}/${note.durationBeats}`).sort();
        expect(scrollNotes.map((note) => `${note.midi}@${note.startBeat}/${note.durationBeats}`).sort(), `${date} tier ${tier}`).toEqual(expected);
      }
    }
  });

  it("renders the notation for a two-hand tier", () => {
    const song = challengeSong(generateChallenge("2026-10-23", 3));
    const { container } = render(
      <ScrollingScore
        notes={song.notes}
        grid={song.grid}
        timeSignatureSegments={song.timeSignatureSegments}
        keys={song.keys}
        verticalRange={{ lowestNote: song.pitchMin, highestNote: song.pitchMax }}
      />,
    );
    expect(container.querySelector("svg")).not.toBeNull();
  });
});

describe("Today's challenge row", () => {
  const tier = (n: 1 | 2 | 3, overrides: Partial<ChallengeTierState> = {}): ChallengeTierState => ({
    tier: n,
    name: ["Starter", "Intermediate", "Advanced"][n - 1]!,
    unlocked: true,
    needs: [],
    key: { id: "C", name: "C major", mode: "major", fifths: 0 },
    tempoBpm: 70,
    durationSeconds: 27,
    attempts: [],
    attemptsLeft: 3,
    best: null,
    stars: 0,
    cleared: false,
    ...overrides,
  });
  const today = (tiers: ChallengeTierState[]): ChallengeTodayResponse => ({ date: "2026-10-23", mode: "major", maxAttempts: 3, clearScore: 70, tiers });

  it("offers the hardest unlocked tier not yet cleared, and nothing when all are locked", () => {
    expect(rowTier(today([tier(1, { unlocked: false }), tier(2, { unlocked: false }), tier(3, { unlocked: false })]))).toBeNull();
    expect(rowTier(today([tier(1), tier(2), tier(3, { unlocked: false })]))!.tier).toBe(2);
    expect(rowTier(today([tier(1), tier(2, { cleared: true }), tier(3, { unlocked: false })]))!.tier).toBe(1);
    expect(rowTier(today([tier(1, { cleared: true }), tier(2, { cleared: true }), tier(3, { unlocked: false })]))!.tier).toBe(2);
  });
});
