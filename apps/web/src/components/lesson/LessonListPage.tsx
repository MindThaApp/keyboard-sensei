import { useEffect } from "react";
import { Link } from "react-router-dom";
import type { LessonListItem, LessonStatus } from "@keyboard-sensei/shared-types";
import { useProgressStore, getLessonStatus, getLessonBestScore } from "../../state/progressStore";
import { LEVEL_LABEL, nextLessonFor } from "../../utils/levels";
import { pathLabel, pathsInOrder, placeInPath } from "../../utils/paths";
import { lessonStars } from "../../utils/stars";
import { StarRating } from "../progress/ProgressBits";

const BRANCH_LABEL: Record<string, string> = {
  technique: "Technique",
  theory: "Theory",
  repertoire: "Repertoire",
};

const LEVEL_ORDER = ["foundation", "elementary", "intermediate", "late-intermediate", "advanced", "virtuoso"];

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
      <path fillRule="evenodd" d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0l-3.5-3.5a1 1 0 1 1 1.4-1.4l2.8 2.79 6.8-6.8a1 1 0 0 1 1.4 0Z" clipRule="evenodd" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5" aria-hidden>
      <path fillRule="evenodd" d="M10 2a4 4 0 0 0-4 4v2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1V6a4 4 0 0 0-4-4Zm2 6V6a2 2 0 1 0-4 0v2h4Z" clipRule="evenodd" />
    </svg>
  );
}

function ProgressBar({ value, className = "" }: { value: number; className?: string }) {
  return (
    <div className={`h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700 ${className}`}>
      <div className="h-full rounded-full bg-brass-500 transition-all" style={{ width: `${Math.round(value * 100)}%` }} />
    </div>
  );
}

function LessonRow({ lesson, number, status, bestScore, isNext }: { lesson: LessonListItem; number: number; status: LessonStatus; bestScore: number | null; isNext: boolean }) {
  const locked = status === "locked";
  const completed = status === "completed";

  const inner = (
    <div
      className={`flex items-center gap-4 rounded-lg border p-3.5 transition-colors ${
        locked
          ? // No opacity fade: it dragged the meta text down to ~2.2:1. Locked reads as
            // locked through the lock icon, the flat background and the muted title.
            "border-slate-200/70 bg-slate-100/60 dark:border-slate-800 dark:bg-slate-900/40"
          : isNext
            ? "border-felt-400 bg-white ring-1 ring-felt-400/50 hover:border-felt-500 dark:border-felt-600 dark:bg-slate-900 dark:ring-felt-600/50"
            : "border-slate-200 bg-white hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-500"
      }`}
    >
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-medium tabular-nums ${
          completed
            ? "bg-brass-100 text-brass-700 dark:bg-brass-700/20 dark:text-brass-300"
            : isNext
              ? "bg-felt-50 text-felt-700 dark:bg-felt-900/40 dark:text-felt-300"
              : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
        }`}
      >
        {completed ? <CheckIcon /> : locked ? <LockIcon /> : number}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`truncate font-medium ${locked ? "text-slate-600 dark:text-slate-300" : "text-slate-900 dark:text-slate-100"}`}>
          {lesson.title}
          {locked && <span className="sr-only"> (locked)</span>}
        </p>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          {BRANCH_LABEL[lesson.branch]} · {lesson.estimatedMinutes} min
        </p>
      </div>
      <div className="shrink-0 text-right text-xs">
        {completed && (
          <span className="flex flex-col items-end gap-0.5">
            <StarRating stars={lessonStars(status, bestScore ?? 0)} className="text-sm" />
            <span className="font-medium tabular-nums text-brass-700 dark:text-brass-300">Best {bestScore}</span>
          </span>
        )}
        {!completed && !locked && (
          <span className="rounded-full bg-felt-50 px-2 py-0.5 font-medium text-felt-700 dark:bg-felt-900/40 dark:text-felt-300">
            {isNext ? "Up next" : bestScore ? `Best ${bestScore}` : "Unlocked"}
          </span>
        )}
      </div>
    </div>
  );

  return <li>{locked ? inner : <Link to={`/lessons/${lesson.id}`}>{inner}</Link>}</li>;
}

export default function LessonListPage() {
  const lessons = useProgressStore((s) => s.lessons);
  const progress = useProgressStore((s) => s.progress);
  const loaded = useProgressStore((s) => s.loaded);
  const loadAll = useProgressStore((s) => s.loadAll);

  useEffect(() => {
    if (!loaded) void loadAll();
  }, [loaded, loadAll]);

  if (!loaded || !progress) {
    return <p className="text-slate-500 dark:text-slate-300">Loading lessons…</p>;
  }

  const statuses = lessons.map((lesson) => getLessonStatus(progress, lesson));
  const completedCount = statuses.filter((s) => s === "completed").length;
  const nextLesson = nextLessonFor(lessons);
  const nextPlace = nextLesson ? placeInPath(lessons, nextLesson.id) : null;
  const minutesCompleted = lessons.filter((_, i) => statuses[i] === "completed").reduce((sum, l) => sum + l.estimatedMinutes, 0);

  const paths = pathsInOrder(lessons);

  return (
    <div className="space-y-8">
      {nextLesson && (
        <section className="card relative overflow-hidden p-5 sm:p-6">
          <div className="felt-strip absolute inset-x-0 top-0" />
          <p className="text-xs font-medium uppercase tracking-widest text-felt-600 dark:text-felt-400">
            {nextLesson.progress.bestScore > 0 ? "Continue practicing" : "Up next"}
          </p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{nextLesson.title}</h1>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                {pathLabel(nextLesson.path)} · Lesson {nextPlace?.position} of {nextPlace?.total} · {LEVEL_LABEL[nextLesson.level]} · {BRANCH_LABEL[nextLesson.branch]} ·{" "}
                {nextLesson.estimatedMinutes} min
                {nextLesson.progress.bestScore > 0 && <> · Best {nextLesson.progress.bestScore}</>}
              </p>
            </div>
            <Link to={`/lessons/${nextLesson.id}`} className="primary-button">
              {nextLesson.progress.bestScore > 0 ? "Continue lesson" : "Start lesson"}
            </Link>
          </div>
          <div className="mt-5 flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
            <span className="shrink-0 tabular-nums">
              {completedCount} of {lessons.length} lessons · {minutesCompleted} min completed
            </span>
            <ProgressBar value={lessons.length ? completedCount / lessons.length : 0} className="flex-1" />
          </div>
        </section>
      )}

      {!nextLesson && (
        <section className="card p-6 text-center">
          <h1 className="text-2xl font-semibold">Path complete</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            You've completed every lesson in every path. Keep your hands warm in the Practice Gym.
          </p>
        </section>
      )}

      {paths.map((path) => {
        const pathLessons = lessons.filter((l) => l.path === path);
        const pathCompleted = pathLessons.filter((l) => getLessonStatus(progress, l) === "completed").length;
        const pathLocked = pathLessons.every((l) => getLessonStatus(progress, l) === "locked");
        const levels = LEVEL_ORDER.filter((level) => pathLessons.some((l) => l.level === level));
        return (
          <section key={path} className="space-y-5" aria-label={pathLabel(path)}>
            <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 pb-2 dark:border-slate-700">
              <h2 className="font-display text-xl font-semibold text-slate-900 dark:text-slate-100">{pathLabel(path)}</h2>
              <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">
                {pathCompleted}/{pathLessons.length} lessons
              </span>
              {pathLocked && (
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Opens after &ldquo;{lessons.find((l) => l.id === pathLessons[0]!.unlockCriteria.requiresLessonIds[0])?.title}&rdquo;
                </span>
              )}
            </div>
            {levels.map((level) => {
              const levelLessons = pathLessons.filter((l) => l.level === level);
              const levelCompleted = levelLessons.filter((l) => getLessonStatus(progress, l) === "completed").length;
              return (
                <div key={level}>
                  <div className="mb-3 flex items-center gap-3">
                    <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">{LEVEL_LABEL[level]}</h3>
                    <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">
                      {levelCompleted}/{levelLessons.length}
                    </span>
                    <ProgressBar value={levelLessons.length ? levelCompleted / levelLessons.length : 0} className="w-24" />
                  </div>
                  <ol className="space-y-2">
                    {levelLessons.map((lesson) => (
                      <LessonRow
                        key={lesson.id}
                        lesson={lesson}
                        number={pathLessons.indexOf(lesson) + 1}
                        status={getLessonStatus(progress, lesson)}
                        bestScore={getLessonBestScore(progress, lesson)}
                        isNext={lesson === nextLesson}
                      />
                    ))}
                  </ol>
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
