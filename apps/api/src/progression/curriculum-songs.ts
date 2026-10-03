import { essentialsSongId } from "../essentials/seed.js";

/**
 * Essentials Beginner versions the course "unlocks": finishing the lesson puts the
 * song on the learner's "Ready for you" shelf and announces it. Nothing is locked —
 * every song stays playable from the library; this only surfaces a piece the lesson
 * has just prepared them for.
 *
 * A song whose version was not generated (or a lesson that was retired) is simply
 * skipped at read time; content tests check every id here against the content.
 */
export const CURRICULUM_SONGS: { lessonId: string; slug: string }[] = [
  // C–G in the right hand, then the first piece everyone learns.
  { lessonId: "lesson-05", slug: "ode-to-joy" },
  { lessonId: "lesson-07", slug: "amazing-grace" },
  { lessonId: "lesson-11", slug: "brahms-lullaby" },
  { lessonId: "lesson-chords-major-symbols", slug: "silent-night" },
  { lessonId: "lesson-reading-hands-together", slug: "joy-to-the-world" },
  { lessonId: "lesson-16", slug: "greensleeves" },
  { lessonId: "lesson-19", slug: "blue-danube" },
  { lessonId: "lesson-21", slug: "gymnopedie-1" },
  { lessonId: "lesson-22", slug: "prelude-in-c" },
  { lessonId: "lesson-27", slug: "minuet-in-g" },
  { lessonId: "lesson-33", slug: "fur-elise" },
  { lessonId: "lesson-chords-twelve-bar-blues", slug: "the-entertainer" },
];

export const curriculumSongId = (slug: string): string => essentialsSongId(slug, "beginner");
