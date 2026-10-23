import { describe, expect, it } from "vitest";
import {
  BASE_KEYS,
  CHALLENGE_TIERS,
  KEYS,
  TIER_KEYS,
  challengeMode,
  generateChallenge,
  hashString,
  mulberry32,
  pickChallengeKey,
  pieceFingerprint,
  validatePiece,
  type ChallengePiece,
  type ChallengeTier,
} from "./index.js";

const DAY_MS = 86_400_000;
const datesFrom = (first: string, count: number): string[] =>
  Array.from({ length: count }, (_, i) => new Date(Date.parse(`${first}T00:00:00Z`) + i * DAY_MS).toISOString().slice(0, 10));

const THREE_YEARS = datesFrom("2026-01-01", 365 * 3 + 1);

/**
 * Pinned output for one day. The API and web suites assert the same values, so a
 * change that would make the client and server disagree (or silently change every
 * learner's past challenges) fails in all three places.
 */
const PINNED: Record<ChallengeTier, string> = {
  1: "F/70/1510d2d2",
  2: "G/85/e8ea599b",
  3: "D/106/153be8cb",
};

describe("seeded randomness", () => {
  it("hashes and draws the same numbers every time", () => {
    expect(hashString("ks-daily-2026-10-23")).toBe(hashString("ks-daily-2026-10-23"));
    expect(hashString("ks-daily-2026-10-23")).not.toBe(hashString("ks-daily-2026-10-24"));
    const a = mulberry32(42);
    const b = mulberry32(42);
    const drawn = Array.from({ length: 5 }, () => a());
    expect(Array.from({ length: 5 }, () => b())).toEqual(drawn);
    for (const value of drawn) expect(value >= 0 && value < 1).toBe(true);
  });
});

describe("generateChallenge", () => {
  it("is deterministic per date, tier and key", () => {
    for (const tier of CHALLENGE_TIERS) {
      expect(generateChallenge("2026-10-23", tier)).toEqual(generateChallenge("2026-10-23", tier));
    }
  });

  it("matches the pinned output for 2026-10-23", () => {
    for (const tier of CHALLENGE_TIERS) expect(pieceFingerprint(generateChallenge("2026-10-23", tier))).toBe(PINNED[tier]);
  });

  it("gives a different tune on different days", () => {
    const tunes = new Set(datesFrom("2026-10-01", 60).map((date) => pieceFingerprint(generateChallenge(date, 1))));
    expect(tunes.size).toBe(60);
  });

  it("rejects malformed dates and keys the tier or day can't use", () => {
    expect(() => generateChallenge("23/10/2026", 1)).toThrow();
    expect(() => generateChallenge("2026-10-23", 1, { key: "Eb" })).toThrow();
    const wrongMode = challengeMode("2026-10-23") === "major" ? "Am" : "C";
    expect(() => generateChallenge("2026-10-23", 1, { key: wrongMode })).toThrow();
  });

  it("passes every musical check on every day for three years, in every tier", () => {
    const failures: string[] = [];
    for (const date of THREE_YEARS) {
      for (const tier of CHALLENGE_TIERS) {
        const problems = validatePiece(generateChallenge(date, tier));
        if (problems.length) failures.push(`${date} tier ${tier}: ${problems.join("; ")}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it("passes in every key a tier allows (every 7th day for three years)", () => {
    const failures: string[] = [];
    THREE_YEARS.filter((_, i) => i % 7 === 0).forEach((date) => {
      for (const tier of CHALLENGE_TIERS) {
        for (const id of TIER_KEYS[tier].filter((key) => KEYS[key]!.mode === challengeMode(date))) {
          const problems = validatePiece(generateChallenge(date, tier, { key: id }));
          if (problems.length) failures.push(`${date} tier ${tier} ${id}: ${problems.join("; ")}`);
        }
      }
    });
    expect(failures).toEqual([]);
  });

  it("keeps each tier's rhythm and hands", () => {
    for (const date of THREE_YEARS.slice(0, 120)) {
      const [starter, intermediate, advanced] = CHALLENGE_TIERS.map((tier) => generateChallenge(date, tier));
      const lengths = (piece: ChallengePiece) => new Set(piece.notes.filter((n) => n.hand === "right").map((n) => n.durationBeats));
      expect([...lengths(starter!)].every((d) => d === 1 || d === 2)).toBe(true);
      expect(starter!.notes.every((n) => n.hand === "right")).toBe(true);
      expect(intermediate!.notes.some((n) => n.hand === "left")).toBe(true);
      expect([...lengths(intermediate!)].some((d) => d < 1)).toBe(true);
      expect([...lengths(advanced!)].some((d) => d === 0.25)).toBe(true);
      expect(starter!.tempoBpm).toBeGreaterThanOrEqual(60);
      expect(starter!.tempoBpm).toBeLessThanOrEqual(72);
      expect(advanced!.tempoBpm).toBeGreaterThanOrEqual(100);
      expect(advanced!.tempoBpm).toBeLessThanOrEqual(120);
    }
  });

  it("is one tune in three tiers: each tier's notes sound, same degree, in the tier above", () => {
    const covers = (lower: ChallengePiece, upper: ChallengePiece) =>
      lower.notes.every((note) =>
        upper.notes.some(
          (other) =>
            other.hand === "right" &&
            other.degree === note.degree &&
            other.startBeat <= note.startBeat &&
            note.startBeat < other.startBeat + other.durationBeats,
        ),
      );
    for (const date of THREE_YEARS.slice(0, 365)) {
      const melody = (tier: ChallengeTier) => {
        const piece = generateChallenge(date, tier);
        return { ...piece, notes: piece.notes.filter((note) => note.hand === "right") };
      };
      const [starter, intermediate, advanced] = [melody(1), melody(2), melody(3)];
      expect(covers(starter, intermediate)).toBe(true);
      expect(covers(intermediate, advanced)).toBe(true);
    }
  });
});

describe("pickChallengeKey", () => {
  it("only uses keys the learner has unlocked, plus C major and A minor", () => {
    for (const date of THREE_YEARS.slice(0, 200)) {
      for (const tier of CHALLENGE_TIERS) {
        const key = pickChallengeKey(date, tier, []);
        expect(BASE_KEYS).toContain(key.id);
        expect(key.mode).toBe(challengeMode(date));
        const some = pickChallengeKey(date, tier, ["G", "Em"]);
        expect([...BASE_KEYS, "G", "Em"]).toContain(some.id);
        expect(TIER_KEYS[tier]).toContain(some.id);
      }
    }
  });

  it("is the same for learners with the same keys, and the tune is the same in degrees", () => {
    const date = "2026-11-05";
    expect(pickChallengeKey(date, 3, ["D", "A"])).toEqual(pickChallengeKey(date, 3, ["A", "D"]));
    const everywhere = generateChallenge(date, 2);
    const basic = generateChallenge(date, 2, { key: pickChallengeKey(date, 2, []).id });
    const degrees = (piece: ChallengePiece) => piece.notes.filter((n) => n.hand === "right").map((n) => `${n.degree}@${n.startBeat}/${n.durationBeats}`);
    expect(degrees(basic)).toEqual(degrees(everywhere));
  });
});
