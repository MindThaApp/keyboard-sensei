import { levelInfo, TIERS } from "./levels.js";
import {
  goalStreak,
  lessonPathOfExercise,
  lessonStarsById,
  songStarsById,
  totalPracticeMinutes,
  type Snapshot,
} from "./snapshot.js";

/**
 * Achievement definitions. `key` is the permanent row key in
 * UserAchievement.achievement_key — never rename one, only add. (The six keys from
 * the first dashboard — first_lesson_completed, streak_7, streak_30,
 * level_complete_*, playalong_high_score, first_quiz_attempt — are kept.)
 *
 * Each achievement is a counter with a target: unlocked once `current >= target`,
 * and a locked one shows its requirement and how far along the learner is.
 * `available` hides achievements for content that doesn't exist (a level with no
 * lessons, a genre with no Essentials piece), so nothing promises missing content.
 */

export type AchievementCategory =
  | "lessons"
  | "paths"
  | "songs"
  | "streaks"
  | "practice"
  | "accuracy"
  | "exploration"
  | "mastery";

export const CATEGORY_LABEL: Record<AchievementCategory, string> = {
  lessons: "Lessons",
  paths: "Paths",
  songs: "Songs & stars",
  streaks: "Streaks",
  practice: "Practice time",
  accuracy: "Accuracy",
  exploration: "Exploration",
  mastery: "Mastery",
};

export interface AchievementStats {
  completedLessons: number;
  totalLessons: number;
  levels: Map<string, { completed: number; total: number }>;
  paths: Map<string, { completed: number; total: number }>;
  threeStarLessons: number;
  songsCompleted: number;
  songStars: number;
  threeStarSongs: number;
  essentialsMastered: number;
  essentialsGenresPlayed: Set<string>;
  essentialsGenresAvailable: Set<string>;
  hasEssentialsFull: boolean;
  longestStreak: number;
  goalDaysMet: number;
  practiceMinutes: number;
  perfectExercises: number;
  bestRunAccuracy: number;
  perfectSongRuns: number;
  pathsTried: Set<string>;
  quizAttempts: number;
  quizzesCompleted: number;
  quizLessons: number;
  playerLevel: number;
}

export interface AchievementDefinition {
  key: string;
  category: AchievementCategory;
  title: string;
  /** The requirement, phrased so it reads as a goal while locked. */
  description: string;
  target: number;
  current: (stats: AchievementStats) => number;
  available?: (stats: AchievementStats) => boolean;
}

const PATH_TITLES: Record<string, string> = {
  "classical-technical": "Classical Technique",
  "sightreading-intensive": "Reading & Rhythm",
  "modern-chords": "Modern Chords",
};

const LEVEL_TITLES: Record<string, string> = {
  foundation: "Foundation",
  elementary: "Elementary",
  intermediate: "Intermediate",
  "late-intermediate": "Late Intermediate",
  advanced: "Advanced",
  virtuoso: "Virtuoso",
};

/** Essentials genres, as the learner would name them. */
const GENRE_TITLES: Record<string, { title: string; label: string }> = {
  classical: { title: "Classical Ear", label: "a classical Essentials piece" },
  jazz: { title: "Ragtime Swing", label: "a ragtime Essentials piece" },
  other: { title: "Carols & Hymns", label: "a carol, hymn or folk tune from the Essentials" },
};

const slug = (value: string): string => value.replace(/[^a-z0-9]+/gi, "_");

const count = (key: string, category: AchievementCategory, title: string, description: string, target: number, current: (s: AchievementStats) => number, available?: (s: AchievementStats) => boolean): AchievementDefinition => ({
  key,
  category,
  title,
  description,
  target,
  current,
  available,
});

const levelGraduate = (level: string): AchievementDefinition =>
  count(
    `level_complete_${slug(level)}`,
    "lessons",
    `${LEVEL_TITLES[level] ?? level} Graduate`,
    `Complete every ${LEVEL_TITLES[level]?.toLowerCase() ?? level} lesson`,
    1,
    (s) => {
      const entry = s.levels.get(level);
      return entry && entry.total > 0 && entry.completed >= entry.total ? 1 : 0;
    },
    (s) => (s.levels.get(level)?.total ?? 0) > 0,
  );

const pathComplete = (path: string): AchievementDefinition =>
  count(
    `path_complete_${slug(path)}`,
    "paths",
    `${PATH_TITLES[path] ?? path} Complete`,
    `Finish every lesson in the ${PATH_TITLES[path] ?? path} path`,
    1,
    (s) => {
      const entry = s.paths.get(path);
      return entry && entry.total > 0 && entry.completed >= entry.total ? 1 : 0;
    },
    (s) => (s.paths.get(path)?.total ?? 0) > 0,
  );

const genreTried = (genre: string): AchievementDefinition =>
  count(
    `essentials_genre_${slug(genre)}`,
    "exploration",
    GENRE_TITLES[genre]?.title ?? `Essentials: ${genre}`,
    `Play ${GENRE_TITLES[genre]?.label ?? `an Essentials ${genre} piece`} to the end`,
    1,
    (s) => (s.essentialsGenresPlayed.has(genre) ? 1 : 0),
    (s) => s.essentialsGenresAvailable.has(genre),
  );

const tierReached = (tierName: string, firstLevel: number): AchievementDefinition =>
  count(
    `tier_${slug(tierName.toLowerCase())}`,
    "mastery",
    `${tierName} Rank`,
    `Reach ${tierName} (level ${firstLevel})`,
    firstLevel,
    (s) => s.playerLevel,
  );

const KNOWN_LEVELS = Object.keys(LEVEL_TITLES);
const KNOWN_PATHS = Object.keys(PATH_TITLES);
const KNOWN_GENRES = Object.keys(GENRE_TITLES);

export const ACHIEVEMENTS: AchievementDefinition[] = [
  // Lessons
  count("first_lesson_completed", "lessons", "First Steps", "Complete your first lesson", 1, (s) => s.completedLessons),
  count("lessons_5", "lessons", "Finding Your Feet", "Complete 5 lessons", 5, (s) => s.completedLessons, (s) => s.totalLessons >= 5),
  count("lessons_15", "lessons", "Steady Hands", "Complete 15 lessons", 15, (s) => s.completedLessons, (s) => s.totalLessons >= 15),
  count("lessons_30", "lessons", "Well Practised", "Complete 30 lessons", 30, (s) => s.completedLessons, (s) => s.totalLessons >= 30),
  count("lessons_all", "lessons", "Complete Course", "Complete every lesson in the course", 1, (s) => (s.totalLessons > 0 && s.completedLessons >= s.totalLessons ? 1 : 0), (s) => s.totalLessons > 0),
  ...KNOWN_LEVELS.map(levelGraduate),
  // Paths
  ...KNOWN_PATHS.map(pathComplete),
  // Songs & stars
  count("first_song", "songs", "First Song", "Play a song to the end at 70% accuracy or better", 1, (s) => s.songsCompleted),
  count("songs_10", "songs", "Repertoire Builder", "Earn a star on 10 different songs", 10, (s) => s.songsCompleted),
  count("song_stars_25", "songs", "Star Collector", "Collect 25 song stars", 25, (s) => s.songStars),
  count("song_three_star", "songs", "Concert Ready", "Earn 3★ on a song (Full level, both hands)", 1, (s) => s.threeStarSongs),
  // Streaks
  count("daily_goal_first", "streaks", "Goal Getter", "Meet your daily practice goal", 1, (s) => s.goalDaysMet),
  count("streak_3", "streaks", "Warming Up", "Meet your daily goal 3 days in a row", 3, (s) => s.longestStreak),
  count("streak_7", "streaks", "Week Warrior", "Meet your daily goal 7 days in a row", 7, (s) => s.longestStreak),
  count("streak_14", "streaks", "Fortnight of Focus", "Meet your daily goal 14 days in a row", 14, (s) => s.longestStreak),
  count("streak_30", "streaks", "Monthly Master", "Meet your daily goal 30 days in a row", 30, (s) => s.longestStreak),
  count("streak_100", "streaks", "Century", "Meet your daily goal 100 days in a row", 100, (s) => s.longestStreak),
  count("goal_days_20", "streaks", "Habit Formed", "Meet your daily goal on 20 different days", 20, (s) => s.goalDaysMet),
  // Practice time
  count("minutes_60", "practice", "First Hour", "Practise for 60 minutes in total", 60, (s) => Math.floor(s.practiceMinutes)),
  count("minutes_300", "practice", "Five Hours In", "Practise for 5 hours in total", 300, (s) => Math.floor(s.practiceMinutes)),
  count("minutes_1200", "practice", "Twenty Hours", "Practise for 20 hours in total", 1200, (s) => Math.floor(s.practiceMinutes)),
  count("minutes_6000", "practice", "Hundred-Hour Hands", "Practise for 100 hours in total", 6000, (s) => Math.floor(s.practiceMinutes)),
  // Accuracy
  count("perfect_exercise", "accuracy", "Flawless", "Score 100 on a lesson exercise", 1, (s) => s.perfectExercises),
  count("perfect_exercises_10", "accuracy", "Precision Player", "Score 100 on 10 different exercises", 10, (s) => s.perfectExercises),
  count("playalong_high_score", "accuracy", "Sharpshooter", "Play a whole song at 95% accuracy or better", 95, (s) => Math.floor(s.bestRunAccuracy)),
  count("perfect_song", "accuracy", "Not a Note Out of Place", "Play a whole song at 100% accuracy (Full level, both hands)", 1, (s) => s.perfectSongRuns),
  // Exploration
  count("first_quiz_attempt", "exploration", "Curious Mind", "Answer your first quiz question", 1, (s) => s.quizAttempts),
  count("quizzes_10", "exploration", "Quiz Whiz", "Get every question right in 10 lesson quizzes", 10, (s) => s.quizzesCompleted, (s) => s.quizLessons >= 10),
  count("explore_all_paths", "exploration", "Explorer", "Practise an exercise in every learning path", 1, (s) => (s.paths.size > 0 && [...s.paths.keys()].every((path) => s.pathsTried.has(path)) ? 1 : 0), (s) => s.paths.size > 1),
  ...KNOWN_GENRES.map(genreTried),
  count("essentials_all_genres", "exploration", "Wide Repertoire", "Play an Essentials piece from every genre", 1, (s) => (s.essentialsGenresAvailable.size > 0 && [...s.essentialsGenresAvailable].every((genre) => s.essentialsGenresPlayed.has(genre)) ? 1 : 0), (s) => s.essentialsGenresAvailable.size > 1),
  // Mastery
  count("lesson_three_star", "mastery", "Polished", "Earn 3★ on a lesson (95+ best score)", 1, (s) => s.threeStarLessons),
  count("lesson_three_star_10", "mastery", "Perfectionist", "Earn 3★ on 10 lessons", 10, (s) => s.threeStarLessons, (s) => s.totalLessons >= 10),
  count("essentials_master", "mastery", "Essentials Master", "Earn 3★ on the Full version of an Essentials piece", 1, (s) => s.essentialsMastered, (s) => s.hasEssentialsFull),
  count("essentials_master_5", "mastery", "Concert Pianist", "Earn 3★ on the Full version of 5 Essentials pieces", 5, (s) => s.essentialsMastered, (s) => s.hasEssentialsFull),
  ...TIERS.filter((tier) => tier.firstLevel > 1).map((tier) => tierReached(tier.name, tier.firstLevel)),
];

export function achievementStats(snapshot: Snapshot): AchievementStats {
  const levels = new Map<string, { completed: number; total: number }>();
  const paths = new Map<string, { completed: number; total: number }>();
  let completedLessons = 0;
  for (const lesson of snapshot.lessons) {
    const done = snapshot.progress.get(lesson.id)?.status === "completed";
    if (done) completedLessons += 1;
    for (const [map, key] of [
      [levels, lesson.level],
      [paths, lesson.path],
    ] as const) {
      const entry = map.get(key) ?? { completed: 0, total: 0 };
      entry.total += 1;
      if (done) entry.completed += 1;
      map.set(key, entry);
    }
  }

  const lessonStars = lessonStarsById(snapshot);
  const songStars = songStarsById(snapshot.playAlong);
  const streak = goalStreak(snapshot);

  const essentialsGenresPlayed = new Set<string>();
  let perfectSongRuns = 0;
  let bestRunAccuracy = 0;
  for (const attempt of snapshot.playAlong) {
    if (attempt.extras.isLoop) continue;
    bestRunAccuracy = Math.max(bestRunAccuracy, attempt.accuracy);
    const song = snapshot.songs.get(attempt.songId);
    if (song?.collection === "essentials") essentialsGenresPlayed.add(song.genre);
    if (attempt.accuracy >= 100 && attempt.extras.level === "full" && attempt.extras.hands === "both") perfectSongRuns += 1;
  }

  let essentialsMastered = 0;
  const masteredGroups = new Set<string>();
  for (const [songId, stars] of songStars) {
    const song = snapshot.songs.get(songId);
    if (song?.collection === "essentials" && song.arrangementLevel === "full" && (stars.byLevel.full ?? 0) >= 3) {
      masteredGroups.add(song.arrangementGroup ?? songId);
    }
  }
  essentialsMastered = masteredGroups.size;

  const exerciseLesson = lessonPathOfExercise(snapshot);
  const pathsTried = new Set<string>();
  const perfectIds = new Set<string>();
  for (const attempt of snapshot.exerciseAttempts) {
    const lesson = exerciseLesson.get(attempt.exerciseId);
    if (lesson) pathsTried.add(lesson.path);
    if (attempt.score >= 100) perfectIds.add(attempt.exerciseId);
  }

  let quizzesCompleted = 0;
  let quizLessons = 0;
  for (const lesson of snapshot.lessons) {
    const questionIds = lesson.sections.flatMap((section) => (section.type === "quiz" ? section.questions.map((q) => q.id) : []));
    if (questionIds.length === 0) continue;
    quizLessons += 1;
    if (questionIds.every((id) => snapshot.correctQuestionIds.has(id))) quizzesCompleted += 1;
  }

  const songStarValues = [...songStars.values()];
  return {
    completedLessons,
    totalLessons: snapshot.lessons.length,
    levels,
    paths,
    threeStarLessons: [...lessonStars.values()].filter((stars) => stars >= 3).length,
    songsCompleted: songStarValues.filter((stars) => stars.best >= 1).length,
    songStars: songStarValues.reduce((sum, stars) => sum + stars.best, 0),
    threeStarSongs: songStarValues.filter((stars) => stars.best >= 3).length,
    essentialsMastered,
    essentialsGenresPlayed,
    essentialsGenresAvailable: new Set(snapshot.essentials.map((song) => song.genre)),
    hasEssentialsFull: snapshot.essentials.some((song) => song.arrangementLevel === "full"),
    longestStreak: streak.longest,
    goalDaysMet: snapshot.practiceDays.filter((day) => day.goalMet).length,
    practiceMinutes: totalPracticeMinutes(snapshot),
    perfectExercises: perfectIds.size,
    bestRunAccuracy,
    perfectSongRuns,
    pathsTried,
    quizAttempts: snapshot.quizAttemptCount,
    quizzesCompleted,
    quizLessons,
    playerLevel: levelInfo(snapshot.xpTotal).level,
  };
}

export interface AchievementView {
  key: string;
  category: AchievementCategory;
  title: string;
  description: string;
  unlocked: boolean;
  unlockedAt: string | null;
  progress: { current: number; target: number };
}

/** Achievements that exist for this content (or were already earned), with each one's state. */
export function achievementViews(stats: AchievementStats, unlocked: ReadonlyMap<string, Date>): AchievementView[] {
  const shown = ACHIEVEMENTS.filter((achievement) => unlocked.has(achievement.key) || (achievement.available?.(stats) ?? true));
  return shown.map((achievement) => {
    const unlockedAt = unlocked.get(achievement.key) ?? null;
    return {
      key: achievement.key,
      category: achievement.category,
      title: achievement.title,
      description: achievement.description,
      unlocked: unlockedAt !== null,
      unlockedAt: unlockedAt?.toISOString() ?? null,
      progress: { current: Math.min(achievement.target, achievement.current(stats)), target: achievement.target },
    };
  });
}

/** Keys of available achievements whose requirement is met but that are not yet stored. */
export function newlyEarned(stats: AchievementStats, unlocked: ReadonlyMap<string, Date>): AchievementDefinition[] {
  return ACHIEVEMENTS.filter(
    (achievement) =>
      !unlocked.has(achievement.key) &&
      (achievement.available?.(stats) ?? true) &&
      achievement.current(stats) >= achievement.target,
  );
}
