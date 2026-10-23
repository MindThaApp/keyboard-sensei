import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import MarkdownSectionView from "./MarkdownSectionView";
import TheoryCardSectionView from "./TheoryCardSectionView";
import LiveNotationSection from "../notation/LiveNotationSection";
import QuizSectionView from "../quiz/QuizSectionView";
import ExerciseSet from "./ExerciseSet";
import { groupExerciseRuns } from "./exerciseRuns";
import MidiStatusBar from "../midi/MidiStatusBar";
import { useFocusMode } from "../../hooks/useFocusMode";
import { Button, GlassSurface, Sheet } from "../ui";
import { useProgressStore } from "../../state/progressStore";
import type { LessonDetail } from "@keyboard-sensei/shared-types";
import { getLesson, getMySongStars, type ReadySong } from "../../services/api";
import { lessonStars } from "../../utils/stars";
import { songPracticeLink } from "../../utils/practiceLinks";
import { StarRating } from "../progress/ProgressBits";
import { levelLabel } from "../../utils/levels";
import { missingPrerequisites, pathLabel, placeInPath } from "../../utils/paths";

export default function LessonPlayerPage() {
  const { lessonId } = useParams<{ lessonId: string }>();
  const lessons = useProgressStore((s) => s.lessons);
  const progress = useProgressStore((s) => s.progress);
  const loaded = useProgressStore((s) => s.loaded);
  const loadAll = useProgressStore((s) => s.loadAll);
  const [detail, setDetail] = useState<LessonDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const focus = useFocusMode();
  const navigate = useNavigate();
  // ?exercise=<id> (from Today's Continue and Review) opens that exercise.
  const [params] = useSearchParams();
  const focusExerciseId = params.get("exercise");
  const [readySongs, setReadySongs] = useState<ReadySong[]>([]);
  const completedNow = lessons.find((l) => l.id === lessonId)?.progress.status === "completed";
  useEffect(() => {
    if (!completedNow) return;
    getMySongStars()
      .then((response) => setReadySongs(response.readyForYou))
      .catch(() => undefined);
  }, [completedNow]);
  const unlockedSongs = readySongs.filter((song) => song.lessonId === lessonId);

  useEffect(() => {
    if (!loaded) void loadAll();
  }, [loaded, loadAll]);

  useEffect(() => {
    if (!lessonId) return;
    setDetail(null);
    setDetailError(null);
    getLesson(lessonId)
      .then(setDetail)
      .catch((e) => setDetailError(e instanceof Error ? e.message : "Unable to load lesson content"));
  }, [lessonId]);

  if (!loaded || !progress) {
    return <p className="text-slate-500 dark:text-slate-300">Loading lesson…</p>;
  }

  const index = lessons.findIndex((l) => l.id === lessonId);
  const lesson = index >= 0 ? lessons[index]! : null;

  if (lesson === null) {
    return (
      <div className="space-y-2">
        <p className="text-slate-700 dark:text-slate-200">Lesson not found.</p>
        <Link to="/learn" className="text-felt-700 underline dark:text-felt-300">Back to lessons</Link>
      </div>
    );
  }

  if (lesson.progress.status === "locked") {
    return (
      <div className="space-y-2">
        <p className="text-slate-700 dark:text-slate-200">
          To unlock &ldquo;{lesson.title}&rdquo;, first complete:{" "}
          {missingPrerequisites(lessons, lesson).map((title) => `“${title}”`).join(", ") || "the previous lesson"}.
        </p>
        <Link to="/learn" className="text-felt-700 underline dark:text-felt-300">Back to lessons</Link>
      </div>
    );
  }

  const completed = lesson.progress.status === "completed";
  const place = placeInPath(lessons, lesson.id)!;
  const nextLesson = place.next;
  const nextUnlocked = nextLesson !== null && nextLesson.progress.status !== "locked";

  const hasExercises = lesson.sections.some((section) => section.type === "midi-exercise");
  const objectives = (
    <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-300">
      {lesson.objectives.map((objective, i) => (
        <li key={i}>{objective}</li>
      ))}
    </ul>
  );

  return (
    <div className="space-y-6">
      <GlassSurface className="sticky top-3 z-30 flex items-center gap-1 rounded-full p-1.5">
        <Button variant="plain" aria-label="Back to lessons" onClick={() => navigate("/learn")}>
          <span aria-hidden>‹</span>
        </Button>
        <h1 className="glass-text min-w-0 flex-1 truncate px-1 text-center text-base font-semibold">{lesson.title}</h1>
        <Button variant="plain" aria-label="About this lesson" aria-haspopup="dialog" onClick={() => setDetailsOpen(true)}>
          <span aria-hidden>⋯</span>
        </Button>
      </GlassSurface>
      <div className="-mt-3">
        <p className="text-sm text-slate-500 dark:text-slate-300">
          {levelLabel(lesson.level)} · {lesson.estimatedMinutes} min · {place.position} of {place.total} in {pathLabel(lesson.path)}
        </p>
        {!hasExercises && <div className="mt-3">{objectives}</div>}
      </div>

      <Sheet open={detailsOpen} onClose={() => setDetailsOpen(false)} title="About this lesson">
        <div className="space-y-4 px-1 pb-2">
          {objectives}
          {hasExercises && <MidiStatusBar />}
          <Link to="/learn" className="inline-block text-sm text-felt-700 underline dark:text-felt-300">
            All lessons
          </Link>
        </div>
      </Sheet>

      {completed && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-brass-400/60 bg-brass-100/60 px-4 py-3 dark:border-brass-600/50 dark:bg-brass-700/10">
          <p className="flex items-center gap-2 text-sm font-medium text-brass-700 dark:text-brass-300">
            <StarRating stars={lessonStars(lesson.progress.status, lesson.progress.bestScore)} />
            Lesson passed · Best {lesson.progress.bestScore}
          </p>
          {unlockedSongs.map((song) => (
            <Link key={song.songId} to={songPracticeLink(song.songId)} className="text-sm font-medium text-felt-700 underline dark:text-felt-300">
              🎵 Song unlocked: {song.title}
            </Link>
          ))}
          {nextLesson && nextUnlocked && (
            <Link to={`/lessons/${nextLesson.id}`} className="primary-button">
              Next: {nextLesson.title} →
            </Link>
          )}
        </div>
      )}

      {detailError && (
        <p role="alert" className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200">
          {detailError} — exercises may not load. Refresh to retry.
        </p>
      )}

      {hasExercises && (
        <div >
          <MidiStatusBar variant="chip" />
        </div>
      )}

      <div className="space-y-6">
        {groupExerciseRuns(lesson.sections).map((block) => {
          if (block.kind === "exercises") {
            if (!detail) {
              return (
                <p key={block.index} className="text-sm text-slate-500 dark:text-slate-300">
                  Loading exercises…
                </p>
              );
            }
            return (
              <ExerciseSet
                key={`${lesson.id}-${block.index}`}
                lessonId={lesson.id}
                sections={block.sections}
                exercises={detail.exercises}
                initialBests={detail.exerciseBests ?? {}}
                focusExerciseId={focusExerciseId}
                afterLast={nextLesson && nextUnlocked ? { label: `Next lesson: ${nextLesson.title}`, to: `/lessons/${nextLesson.id}` } : null}
                focus={focus}
              />
            );
          }
          const { section, index: sectionIndex } = block;
          switch (section.type) {
            case "markdown":
              return <MarkdownSectionView key={sectionIndex} section={section} lessonId={lesson.id} sectionIndex={sectionIndex} />;
            case "theory-card":
              return <TheoryCardSectionView key={sectionIndex} section={section} lessonId={lesson.id} sectionIndex={sectionIndex} />;
            case "notation":
              return <LiveNotationSection key={sectionIndex} data={section.vexflowData} title={section.title} />;
            case "quiz":
              return <QuizSectionView key={sectionIndex} section={section} />;
            default:
              return null;
          }
        })}
      </div>
    </div>
  );
}
