import type { PrismaClient } from "@prisma/client";
import type { Lesson } from "@keyboard-sensei/shared-types";
import { dayKey } from "./days.js";

/**
 * Six skills shown to the learner, fed by the `skillRewards` every lesson carries
 * (finer-grained keys, mapped below) and by songs.
 *
 *   points from a completed lesson = reward × 10 × the lesson's stars (1–3)
 *   repertoire also gets 10 × stars for each repertoire-branch lesson,
 *   and 10 per star on each song (its best version)
 */

export type SkillId = "reading" | "rhythm" | "technique" | "chords" | "ear" | "repertoire";

export const SKILLS: { id: SkillId; label: string }[] = [
  { id: "reading", label: "Note reading" },
  { id: "rhythm", label: "Rhythm" },
  { id: "technique", label: "Technique" },
  { id: "chords", label: "Chords" },
  { id: "ear", label: "Ear & theory" },
  { id: "repertoire", label: "Repertoire" },
];

/** Content reward key → displayed skill. An unknown key counts towards nothing. */
export const SKILL_OF_REWARD: Record<string, SkillId> = {
  note_reading: "reading",
  sight_reading: "reading",
  keyboard_layout: "reading",
  rhythm: "rhythm",
  timing: "rhythm",
  technique: "technique",
  chords: "chords",
  theory: "ear",
  ear: "ear",
  repertoire: "repertoire",
};

const POINTS_PER_REWARD = 10;
const POINTS_PER_SONG_STAR = 10;

export function skillPoints(
  lessons: Pick<Lesson, "id" | "branch" | "skillRewards">[],
  lessonStarsById: ReadonlyMap<string, number>,
  songStars: Iterable<number>,
  /** Points from outside lessons and songs (the note-reading game), added per skill. */
  extra: Partial<Record<SkillId, number>> = {},
): Record<SkillId, number> {
  const points: Record<SkillId, number> = { reading: 0, rhythm: 0, technique: 0, chords: 0, ear: 0, repertoire: 0 };
  for (const lesson of lessons) {
    const stars = lessonStarsById.get(lesson.id) ?? 0;
    if (stars === 0) continue;
    for (const [key, reward] of Object.entries(lesson.skillRewards)) {
      const skill = SKILL_OF_REWARD[key];
      if (skill) points[skill] += reward * POINTS_PER_REWARD * stars;
    }
    if (lesson.branch === "repertoire") points.repertoire += POINTS_PER_REWARD * stars;
  }
  for (const stars of songStars) points.repertoire += stars * POINTS_PER_SONG_STAR;
  for (const [skill, bonus] of Object.entries(extra)) points[skill as SkillId] += bonus;
  return points;
}

/** Note-reading game: +1 reading point per 10 correct answers in a day, up to 5 points a day. */
export const READING_GAME_CORRECT_PER_POINT = 10;
export const READING_GAME_DAILY_POINT_CAP = 5;

/** Points one day's worth of correct answers earns. */
export const readingGameDayPoints = (correctToday: number): number =>
  Math.min(READING_GAME_DAILY_POINT_CAP, Math.floor(Math.max(0, correctToday) / READING_GAME_CORRECT_PER_POINT));

/**
 * Reading points earned by the note-reading game. Correct answers are pooled per calendar day
 * (the learner's own day) before dividing, so several short rounds still add up to a point.
 */
export function readingGamePoints(rounds: { correct: number; day: string }[]): number {
  const correctByDay = new Map<string, number>();
  for (const round of rounds) correctByDay.set(round.day, (correctByDay.get(round.day) ?? 0) + round.correct);
  let points = 0;
  for (const correct of correctByDay.values()) points += readingGameDayPoints(correct);
  return points;
}

type GameRoundDb = Pick<PrismaClient, "gameRound">;

/** Every note-reading round's correct count with the learner's calendar day it fell on. */
export async function readingGameRounds(
  db: GameRoundDb,
  userId: string,
  timezone: string | null,
): Promise<{ correct: number; day: string }[]> {
  const rounds = await db.gameRound.findMany({
    where: { user_id: userId, game: "note_reading" },
    select: { correct: true, created_at: true },
  });
  return rounds.map((round) => ({ correct: round.correct, day: dayKey(round.created_at, timezone) }));
}

/** The `extra` argument for `skillPoints`: what the note-reading game has earned the reading skill. */
export async function readingGameSkillPoints(
  db: GameRoundDb,
  userId: string,
  timezone: string | null,
): Promise<Partial<Record<SkillId, number>>> {
  return { reading: readingGamePoints(await readingGameRounds(db, userId, timezone)) };
}
