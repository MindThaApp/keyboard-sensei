import { t } from "../i18n";
import { TIER_NAMES, type LessonListItem, type PlayedInstrument, type SkillChip, type TierId } from "@keyboard-sensei/shared-types";

/**
 * Learn's filter: the piano learning paths, as a way to narrow the tier list. Learn
 * already shows only the active instrument's lessons (utils/playedInstrument), so
 * there is no per-instrument entry here.
 */
export type LearnFilter = "all" | "foundations" | "reading" | "chords";

export const LEARN_FILTERS: { value: LearnFilter; label: string; paths: readonly string[] | null; instrument: PlayedInstrument | null }[] = [
  { value: "all", label: "All", paths: null, instrument: null },
  { value: "foundations", label: "Foundations", paths: ["classical-technical"], instrument: "piano" },
  { value: "reading", label: "Reading", paths: ["sightreading-intensive"], instrument: "piano" },
  { value: "chords", label: "Chords & Pop", paths: ["modern-chords"], instrument: "piano" },
];

/** The filters that make sense for one instrument ("all" first). A single entry means there is nothing to choose. */
export function learnFiltersFor(instrument: PlayedInstrument): typeof LEARN_FILTERS {
  return LEARN_FILTERS.filter((entry) => entry.instrument === null || entry.instrument === instrument);
}

export const SKILL_LABEL: Record<SkillChip, string> = {
  "five-finger": "Five-finger",
  "reading-treble": "Treble reading",
  "reading-bass": "Bass reading",
  rhythm: "Rhythm",
  scales: "Scales",
  chords: "Chords",
  technique: "Technique",
  ear: "Ear",
  repertoire: "Repertoire",
  "two-hands": "Two hands",
};

export interface TierGroup {
  tier: TierId;
  name: string;
  lessons: LessonListItem[];
  completed: number;
  /** No lesson in the whole course sits in this tier yet. */
  comingSoon: boolean;
}

export const TIER_IDS: readonly TierId[] = [0, 1, 2, 3, 4, 5, 6, 7];

/**
 * Group lessons by tier. Lessons keep their course order within a tier. A tier that is
 * empty only because of the filter is left out; a tier empty in the whole course is kept
 * as "coming soon".
 */
export function groupByTier(allLessons: readonly LessonListItem[], filter: LearnFilter): TierGroup[] {
  const paths = LEARN_FILTERS.find((entry) => entry.value === filter)?.paths ?? null;
  const visible = paths ? allLessons.filter((lesson) => paths.includes(lesson.path)) : [...allLessons];
  const groups: TierGroup[] = [];
  for (const tier of TIER_IDS) {
    const lessons = visible.filter((lesson) => lesson.tier === tier);
    const inCourse = allLessons.some((lesson) => lesson.tier === tier);
    if (lessons.length === 0 && inCourse) continue;
    groups.push({
      tier,
      name: t(`lesson.tier.${tier}`) || TIER_NAMES[tier],
      lessons,
      completed: lessons.filter((lesson) => lesson.progress.status === "completed").length,
      comingSoon: !inCourse,
    });
  }
  return groups;
}

/** The first tier that still has an unfinished lesson (the learner's current level), or null. */
export function currentTierOf(groups: readonly TierGroup[]): TierId | null {
  return groups.find((group) => group.lessons.length > 0 && group.completed < group.lessons.length)?.tier ?? null;
}
