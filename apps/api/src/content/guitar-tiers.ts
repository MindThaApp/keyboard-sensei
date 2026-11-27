import type { SkillChip, TierId } from "@keyboard-sensei/shared-types";

/** Tier and skill chips for every guitar lesson, keyed by the permanent lesson id (merged into LESSON_TIERS). */
export const GUITAR_LESSON_TIERS: Record<string, { tier: TierId; skills: SkillChip[] }> = {
  // Tier 0: first steps
  "guitar-meet-your-guitar": { tier: 0, skills: ["technique"] },
  "guitar-tuning-up": { tier: 0, skills: ["technique", "ear"] },
  "guitar-reading-tab": { tier: 0, skills: ["reading-treble"] },
  "guitar-open-string-rhythm": { tier: 0, skills: ["rhythm", "technique"] },
  // Tier 1: first notes and first chords
  "guitar-first-notes-high-e": { tier: 1, skills: ["reading-treble", "technique"] },
  "guitar-first-notes-b-g": { tier: 1, skills: ["reading-treble", "technique"] },
  "guitar-first-melodies": { tier: 1, skills: ["reading-treble", "repertoire"] },
  "guitar-chords-em-am": { tier: 1, skills: ["chords", "technique"] },
  "guitar-chords-e-a-d": { tier: 1, skills: ["chords", "technique"] },
  "guitar-first-changes": { tier: 1, skills: ["chords", "rhythm"] },
  // Tier 2: chord changes and bass notes
  "guitar-bass-notes": { tier: 2, skills: ["reading-treble", "technique"] },
  "guitar-chords-g-c": { tier: 2, skills: ["chords", "technique"] },
  "guitar-sevenths-d7-a7": { tier: 2, skills: ["chords"] },
  "guitar-one-four-five": { tier: 2, skills: ["chords", "repertoire"] },
  "guitar-strum-patterns": { tier: 2, skills: ["chords", "rhythm"] },
  "guitar-alternating-bass": { tier: 2, skills: ["chords", "technique", "rhythm"] },
};
