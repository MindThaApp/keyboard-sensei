/**
 * Prerequisites a lesson had before its path was reordered by tier (2026-10), for every
 * lesson whose prerequisites changed then. FROZEN: never edit an entry, only add new ones
 * if a later reorder re-points more lessons.
 *
 * Read only by the unlock backfill (backfillUnlocks in progress.ts): a learner who had
 * finished a lesson's old prerequisites keeps that lesson open even if they have not yet
 * finished its new ones, so a reorder can never take a lesson away from anyone.
 */
export const LEGACY_PREREQUISITES: Readonly<Record<string, readonly string[]>> = {
  // Classical path
  "lesson-07": ["lesson-06"],
  "lesson-08": ["lesson-07"],
  "lesson-10": ["lesson-09"],
  "lesson-11": ["lesson-10"],
  "lesson-12": ["lesson-11"],
  "lesson-15": ["lesson-14"],
  "lesson-17": ["lesson-16"],
  "lesson-18": ["lesson-17"],
  "lesson-19": ["lesson-18"],
  "lesson-20": ["lesson-19"],
  "lesson-24": ["lesson-23"],
  "lesson-25": ["lesson-24"],
  "lesson-27": ["lesson-26"],
  "lesson-28": ["lesson-27"],
  "lesson-30": ["lesson-29"],
  "lesson-31": ["lesson-30"],
  "lesson-32": ["lesson-31"],
  "lesson-33": ["lesson-32"],
  // Reading & Rhythm
  "lesson-reading-g-f-positions": ["lesson-rhythm-rests"],
  "lesson-reading-intervals": ["lesson-reading-g-f-positions"],
  "lesson-rhythm-eighths": ["lesson-reading-intervals"],
  // Modern Chords
  "lesson-chords-sevenths-sus": ["lesson-chords-minor-symbols"],
  "lesson-chords-lh-block-broken": ["lesson-chords-sevenths-sus"],
  "lesson-chords-alberti-arpeggio": ["lesson-chords-lh-block-broken"],
};
