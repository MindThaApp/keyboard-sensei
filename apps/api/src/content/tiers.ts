import type { Lesson, SkillChip, TierId } from "@keyboard-sensei/shared-types";

interface TierAssignment {
  tier: TierId;
  skills: SkillChip[];
}

const at = (tier: TierId, skills: SkillChip[]): TierAssignment => ({ tier, skills });

/**
 * Tier and skill chips for every lesson, keyed by the permanent lesson id.
 * Tiers 6 and 7 are intentionally empty (the UI shows them as "Coming soon").
 * Each path's unlock chain is ordered by tier (see content.ts), so a lesson's
 * prerequisites are always in the same or an earlier tier (checked by validateTiers).
 */
export const LESSON_TIERS: Record<string, TierAssignment> = {
  // Tier 0: first steps
  "lesson-01": at(0, ["technique"]),
  "lesson-02": at(0, ["technique", "five-finger"]),
  "lesson-03": at(0, ["reading-treble", "reading-bass"]),
  "lesson-04": at(0, ["rhythm"]),
  "lesson-05": at(0, ["reading-treble", "five-finger"]),
  "lesson-06": at(0, ["reading-bass", "five-finger"]),

  // Tier 1: basic beginner, one hand in C position
  "lesson-reading-c-position": at(1, ["reading-treble", "five-finger"]),
  "lesson-rhythm-rests": at(1, ["rhythm"]),
  "lesson-08": at(1, ["five-finger", "technique"]),
  "lesson-09": at(1, ["technique", "five-finger"]),
  "lesson-reading-intervals": at(1, ["reading-treble"]),
  "lesson-11": at(1, ["reading-treble", "rhythm"]),

  // Tier 2: two hands
  "lesson-07": at(2, ["two-hands"]),
  "lesson-reading-hands-together": at(2, ["reading-treble", "reading-bass", "two-hands"]),
  "lesson-reading-g-f-positions": at(2, ["reading-treble", "reading-bass"]),
  "lesson-rhythm-eighths": at(2, ["rhythm"]),
  "lesson-chords-major-symbols": at(2, ["chords"]),
  "lesson-chords-minor-symbols": at(2, ["chords"]),
  "lesson-chords-lh-block-broken": at(2, ["chords", "two-hands"]),
  "lesson-10": at(2, ["chords"]),
  "lesson-12": at(2, ["reading-treble", "chords", "two-hands"]),

  // Tier 3: elementary
  "lesson-13": at(3, ["scales", "technique"]),
  "lesson-14": at(3, ["scales"]),
  "lesson-19": at(3, ["rhythm"]),
  "lesson-25": at(3, ["repertoire"]),
  "lesson-26": at(3, ["repertoire"]),
  "lesson-28": at(3, ["ear"]),
  "lesson-29": at(3, ["ear"]),
  "lesson-reading-ledger-lines": at(3, ["reading-treble", "reading-bass"]),
  "lesson-rhythm-dotted-and-ties": at(3, ["rhythm"]),
  "lesson-chords-sevenths-sus": at(3, ["chords"]),

  // Tier 4: upper elementary
  "lesson-15": at(4, ["scales"]),
  "lesson-16": at(4, ["scales"]),
  "lesson-18": at(4, ["chords"]),
  "lesson-20": at(4, ["two-hands", "technique"]),
  "lesson-21": at(4, ["technique"]),
  "lesson-22": at(4, ["technique", "chords"]),
  "lesson-23": at(4, ["reading-treble", "rhythm"]),
  "lesson-27": at(4, ["repertoire", "two-hands"]),
  "lesson-30": at(4, ["ear"]),
  "lesson-32": at(4, ["scales"]),
  "lesson-reading-sharp-keys": at(4, ["reading-treble", "scales"]),
  "lesson-reading-flat-keys": at(4, ["reading-treble", "scales"]),
  "lesson-chords-alberti-arpeggio": at(4, ["chords", "two-hands"]),
  "lesson-chords-pop-patterns": at(4, ["chords", "rhythm"]),
  "lesson-chords-voice-leading": at(4, ["chords"]),

  // Tier 5: intermediate
  "lesson-17": at(5, ["chords"]),
  "lesson-24": at(5, ["technique", "scales", "chords"]),
  "lesson-31": at(5, ["scales"]),
  "lesson-33": at(5, ["scales"]),
  "lesson-34": at(5, ["technique", "chords", "two-hands"]),
  "lesson-e-major": at(5, ["scales"]),
  "lesson-bb-eb-major": at(5, ["scales"]),
  "lesson-ab-major": at(5, ["scales"]),
  "lesson-e-d-harmonic-minor": at(5, ["scales"]),
  "lesson-reading-syncopation": at(5, ["reading-treble", "rhythm"]),
  "lesson-chords-progressions": at(5, ["chords"]),
  "lesson-chords-twelve-bar-blues": at(5, ["chords", "repertoire"]),
  "lesson-chords-lead-sheet": at(5, ["chords", "repertoire", "two-hands"]),
};

/** The tier of a lesson id; throws if the lesson has no assignment. */
export function tierOf(lessonId: string): TierId {
  const assignment = LESSON_TIERS[lessonId];
  if (!assignment) throw new Error(`Lesson ${lessonId} has no tier assignment (content/tiers.ts)`);
  return assignment.tier;
}

/** Attach the tier and skills to a lesson; throws if the lesson has no assignment. */
export function withTier(lesson: Lesson): Lesson {
  const assignment = LESSON_TIERS[lesson.id];
  if (!assignment) throw new Error(`Lesson ${lesson.id} has no tier assignment (content/tiers.ts)`);
  return { ...lesson, tier: assignment.tier, skills: assignment.skills };
}

/**
 * Seed-time validation: every lesson has a tier and at least one skill, the table has
 * no stray ids, and no lesson waits on a prerequisite from a later tier.
 */
export function validateTiers(lessons: readonly Lesson[]): void {
  const byId = new Map(lessons.map((lesson) => [lesson.id, lesson]));
  const ids = new Set(byId.keys());
  for (const lesson of lessons) {
    if (!Number.isInteger(lesson.tier) || lesson.tier < 0 || lesson.tier > 7) throw new Error(`Lesson ${lesson.id} has an invalid tier`);
    if (lesson.skills.length === 0) throw new Error(`Lesson ${lesson.id} has no skills`);
    for (const requiredId of lesson.unlockCriteria.requiresLessonIds) {
      const required = byId.get(requiredId);
      if (!required) throw new Error(`Lesson ${lesson.id} requires unknown lesson ${requiredId}`);
      if (required.tier > lesson.tier) {
        throw new Error(`Lesson ${lesson.id} (tier ${lesson.tier}) requires ${requiredId} from a later tier (${required.tier})`);
      }
    }
  }
  for (const id of Object.keys(LESSON_TIERS)) {
    if (!ids.has(id)) throw new Error(`content/tiers.ts lists unknown lesson ${id}`);
  }
}
