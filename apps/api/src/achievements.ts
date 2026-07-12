/**
 * Fixed, hardcoded achievement definitions for the progress dashboard.
 *
 * Each achievement has a stable `key` (used as the unique DB row key in
 * `UserAchievement.achievement_key` — never rename an existing key, only add
 * new ones) and a pure `criteria` function evaluated against freshly computed
 * `DashboardStats`. See `dashboard.ts` for how criteria are evaluated and
 * persisted.
 *
 * Note on scope: the originally sketched "first practice gym attempt"
 * achievement isn't implementable — Practice Gym drills are scored via the
 * stateless `POST /practice/score` endpoint, which never persists an attempt
 * anywhere (no user/session tie-in at all). Substituted with "first quiz
 * attempt" (`QuizAttempt` is the closest persisted, previously-uncovered
 * practice signal). Flagged in the batch report; not a silent scope change.
 */

/** Per-level lesson completion counts, one entry per level actually present among seeded Lesson rows. */
export interface LevelProgressStat {
  level: string;
  completed: number;
  total: number;
}

/** Stats computed fresh on every dashboard request; achievement criteria are pure functions of this shape. */
export interface DashboardStats {
  completedLessonCount: number;
  currentStreak: number;
  longestStreak: number;
  levelProgress: LevelProgressStat[];
  maxPlayAlongAccuracy: number;
  quizAttemptCount: number;
}

export interface AchievementDefinition {
  key: string;
  title: string;
  description: string;
  criteria: (stats: DashboardStats) => boolean;
}

const levelComplete = (level: string): AchievementDefinition => ({
  key: `level_complete_${level.replace(/[^a-z0-9]+/gi, "_")}`,
  title: `${levelLabel(level)} Graduate`,
  description: `Complete every lesson in the ${levelLabel(level).toLowerCase()} level`,
  criteria: (stats) => {
    const entry = stats.levelProgress.find((item) => item.level === level);
    return !!entry && entry.total > 0 && entry.completed >= entry.total;
  },
});

function levelLabel(level: string): string {
  return level
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// All LevelId values from @keyboard-sensei/shared-types. Kept as a plain
// string list (not a type import) so this file has no dependency on lesson
// content volume -- a level with zero seeded lessons simply never unlocks.
const KNOWN_LEVELS = ["foundation", "elementary", "intermediate", "late-intermediate", "advanced", "virtuoso"];

export const ACHIEVEMENTS: AchievementDefinition[] = [
  {
    key: "first_lesson_completed",
    title: "First Steps",
    description: "Complete your first lesson",
    criteria: (stats) => stats.completedLessonCount >= 1,
  },
  {
    key: "streak_7",
    title: "Week Warrior",
    description: "Practice 7 days in a row",
    criteria: (stats) => stats.longestStreak >= 7,
  },
  {
    key: "streak_30",
    title: "Monthly Master",
    description: "Practice 30 days in a row",
    criteria: (stats) => stats.longestStreak >= 30,
  },
  ...KNOWN_LEVELS.map(levelComplete),
  {
    key: "playalong_high_score",
    title: "Sharpshooter",
    description: "Score at least 95% accuracy on a Play-Along attempt",
    criteria: (stats) => stats.maxPlayAlongAccuracy >= 0.95,
  },
  {
    key: "first_quiz_attempt",
    title: "Curious Mind",
    description: "Answer your first quiz question",
    criteria: (stats) => stats.quizAttemptCount >= 1,
  },
];
