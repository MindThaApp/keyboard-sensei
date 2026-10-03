import type { Lesson } from "@keyboard-sensei/shared-types";

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
  return points;
}
