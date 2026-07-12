import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import MarkdownSectionView from "./MarkdownSectionView";
import TheoryCardSectionView from "./TheoryCardSectionView";
import NotationRenderer from "../notation/NotationRenderer";
import QuizSectionView from "../quiz/QuizSectionView";
import MidiExercise from "../midi/MidiExercise";
import MidiStatusBar from "../midi/MidiStatusBar";
import { useProgressStore } from "../../state/progressStore";
import type { LessonDetail } from "@keyboard-sensei/shared-types";
import { getLesson } from "../../services/api";

const LEVEL_LABEL: Record<string, string> = {
  foundation: "Foundation",
  elementary: "Elementary",
  intermediate: "Intermediate",
  "late-intermediate": "Late Intermediate",
  advanced: "Advanced",
  virtuoso: "Virtuoso",
};

export default function LessonPlayerPage() {
  const { lessonId } = useParams<{ lessonId: string }>();
  const lessons = useProgressStore((s) => s.lessons);
  const progress = useProgressStore((s) => s.progress);
  const loaded = useProgressStore((s) => s.loaded);
  const loadAll = useProgressStore((s) => s.loadAll);
  const [detail, setDetail] = useState<LessonDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

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
        <Link to="/" className="text-felt-700 underline dark:text-felt-300">Back to lessons</Link>
      </div>
    );
  }

  if (lesson.progress.status === "locked") {
    return (
      <div className="space-y-2">
        <p className="text-slate-700 dark:text-slate-200">Complete the previous lesson to unlock &ldquo;{lesson.title}&rdquo;.</p>
        <Link to="/" className="text-felt-700 underline dark:text-felt-300">Back to lessons</Link>
      </div>
    );
  }

  const completed = lesson.progress.status === "completed";
  const nextLesson = index + 1 < lessons.length ? lessons[index + 1]! : null;
  const nextUnlocked = nextLesson !== null && nextLesson.progress.status !== "locked";

  return (
    <div className="space-y-6">
      <div>
        <nav className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <Link to="/" className="hover:text-slate-800 dark:hover:text-slate-200">Lessons</Link>
          <span aria-hidden>/</span>
          <span className="tabular-nums">
            {index + 1} of {lessons.length}
          </span>
        </nav>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">{lesson.title}</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-300">
          {LEVEL_LABEL[lesson.level]} · {lesson.estimatedMinutes} min
          {lesson.progress.bestScore > 0 && <> · Best {lesson.progress.bestScore}</>}
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-300">
          {lesson.objectives.map((objective, i) => (
            <li key={i}>{objective}</li>
          ))}
        </ul>
      </div>

      {completed && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-brass-400/60 bg-brass-100/60 px-4 py-3 dark:border-brass-600/50 dark:bg-brass-700/10">
          <p className="text-sm font-medium text-brass-700 dark:text-brass-300">
            Lesson passed · Best {lesson.progress.bestScore}
          </p>
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

      {lesson.sections.some((section) => section.type === "midi-exercise") && <MidiStatusBar />}

      <div className="space-y-6">
        {lesson.sections.map((section, sectionIndex) => {
          switch (section.type) {
            case "markdown":
              return <MarkdownSectionView key={sectionIndex} section={section} lessonId={lesson.id} sectionIndex={sectionIndex} />;
            case "theory-card":
              return <TheoryCardSectionView key={sectionIndex} section={section} lessonId={lesson.id} sectionIndex={sectionIndex} />;
            case "notation":
              return <NotationRenderer key={sectionIndex} data={section.vexflowData} title={section.title} />;
            case "quiz":
              return <QuizSectionView key={sectionIndex} section={section} />;
            case "midi-exercise":
              return (
                <MidiExercise
                  key={sectionIndex}
                  exerciseId={section.exerciseId}
                  title={section.title}
                  instructions={section.instructions}
                  lessonId={lesson.id}
                  exercise={detail?.exercises.find((item) => item.exerciseId === section.exerciseId)}
                />
              );
            default:
              return null;
          }
        })}
      </div>
    </div>
  );
}
