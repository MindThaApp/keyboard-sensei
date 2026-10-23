import { CHALLENGE_TIERS, type ChallengeTier } from "@keyboard-sensei/challenge-gen";

/**
 * What a learner has been taught decides what the daily challenge may ask of them.
 *
 * A requirement is a list of groups: every group must be met, and a group is met by
 * completing ANY one of its lessons (the course teaches most things twice, once in
 * the classical path and once in the reading or chords path). Each group lists the
 * gentlest route first: that is the lesson a locked tier points to.
 *
 * Tiers unlock in order, each needing what its music uses (generator: TIER_SHAPE):
 *   Starter       treble reading in C position; quarters and halves
 *   Intermediate  eighths and dotted quarters; the bass clef; hands together
 *   Advanced      sixteenths and ties; broken chords and sevenths in the left hand
 *
 * Keys beyond C major and A minor unlock with the lessons that teach them. A tier is
 * played in a key the learner knows; the tune is the same in any key.
 */

type Requirement = readonly (readonly string[])[];

const MINOR_LESSONS = ["lesson-16", "lesson-33", "lesson-e-d-harmonic-minor"];
const SHARP_KEY_READING = "lesson-reading-sharp-keys";
const FLAT_KEY_READING = "lesson-reading-flat-keys";
const D_MAJOR = ["lesson-14", SHARP_KEY_READING];
const B_FLAT_MAJOR = ["lesson-bb-eb-major", FLAT_KEY_READING];
const A_MAJOR = ["lesson-31", SHARP_KEY_READING];
const E_FLAT_MAJOR = ["lesson-bb-eb-major", FLAT_KEY_READING];

export const TIER_REQUIREMENTS: Record<ChallengeTier, Requirement> = {
  1: [["lesson-04", "lesson-rhythm-rests"], ["lesson-05", "lesson-reading-c-position"]],
  2: [
    ["lesson-rhythm-eighths", "lesson-19"],
    ["lesson-rhythm-dotted-and-ties", "lesson-19"],
    ["lesson-06"],
    ["lesson-07", "lesson-reading-hands-together"],
  ],
  3: [
    ["lesson-rhythm-dotted-and-ties"],
    ["lesson-reading-syncopation", "lesson-19"],
    ["lesson-34", "lesson-chords-lh-block-broken", "lesson-chords-alberti-arpeggio"],
    ["lesson-17", "lesson-chords-sevenths-sus"],
  ],
};

export const KEY_REQUIREMENTS: Record<string, Requirement> = {
  G: [["lesson-reading-g-f-positions", "lesson-14", SHARP_KEY_READING]],
  F: [["lesson-reading-g-f-positions", "lesson-32", FLAT_KEY_READING]],
  D: [D_MAJOR],
  Bb: [B_FLAT_MAJOR],
  A: [A_MAJOR],
  Eb: [E_FLAT_MAJOR],
  Em: [MINOR_LESSONS],
  Dm: [MINOR_LESSONS],
  Bm: [D_MAJOR, MINOR_LESSONS],
  Gm: [B_FLAT_MAJOR, MINOR_LESSONS],
  "F#m": [A_MAJOR, MINOR_LESSONS],
  Cm: [E_FLAT_MAJOR, MINOR_LESSONS],
};

export interface LessonRef {
  id: string;
  title: string;
}

export interface TierAccess {
  tier: ChallengeTier;
  unlocked: boolean;
  /** One lesson per unmet requirement of this tier and those below, for "Finish … to unlock". */
  needs: LessonRef[];
}

export interface ChallengeAccess {
  tiers: TierAccess[];
  /** Key ids the learner has met (C major and A minor are always allowed on top). */
  keys: string[];
}

/** Lesson ids every requirement mentions, for checking them against the content. */
export const REQUIRED_LESSON_IDS: string[] = [
  ...new Set([...Object.values(TIER_REQUIREMENTS), ...Object.values(KEY_REQUIREMENTS)].flat(2)),
];

/**
 * @param completed ids of the learner's completed lessons
 * @param lessons the live lessons (titles for "needs"; retired ones are skipped)
 */
export function challengeAccess(completed: ReadonlySet<string>, lessons: readonly LessonRef[]): ChallengeAccess {
  const live = new Map(lessons.map((lesson) => [lesson.id, lesson]));
  const unmet = (requirement: Requirement): LessonRef[] =>
    requirement
      .filter((group) => !group.some((id) => completed.has(id)))
      .flatMap((group) => {
        // Point at the group's first live lesson (groups list the gentlest route first);
        // a group with no live lesson can't block.
        const first = group.find((id) => live.has(id));
        return first ? [live.get(first)!] : [];
      });

  // A tier also needs everything the tiers below it need.
  const tiers: TierAccess[] = [];
  const needs = new Map<string, LessonRef>();
  for (const tier of CHALLENGE_TIERS) {
    for (const lesson of unmet(TIER_REQUIREMENTS[tier])) needs.set(lesson.id, lesson);
    tiers.push({ tier, unlocked: needs.size === 0, needs: [...needs.values()] });
  }
  const keys = Object.entries(KEY_REQUIREMENTS)
    .filter(([, requirement]) => unmet(requirement).length === 0)
    .map(([id]) => id);
  return { tiers, keys };
}
