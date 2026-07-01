import { useEffect } from "react";
import { Link } from "react-router-dom";
import type { LessonStatus } from "@keyboard-sensei/shared-types";
import { useProgressStore, getLessonStatus, getLessonBestScore } from "../../state/progressStore";

const LEVEL_LABEL: Record<string, string> = {
  foundation: "Foundation",
  elementary: "Elementary",
  intermediate: "Intermediate",
  "late-intermediate": "Late Intermediate",
  advanced: "Advanced",
  virtuoso: "Virtuoso",
};

const BRANCH_LABEL: Record<string, string> = {
  technique: "Technique",
  theory: "Theory",
  repertoire: "Repertoire",
};

const LEVEL_ORDER = ["foundation", "elementary", "intermediate", "late-intermediate", "advanced", "virtuoso"];

function StatusBadge({ status, bestScore }: { status: LessonStatus; bestScore: number | null }) {
  if (status === "completed") {
    return (
      <span className="whitespace-nowrap rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
        Completed{bestScore != null ? ` · ${bestScore}` : ""}
      </span>
    );
  }
  if (status === "unlocked") {
    return (
      <span className="whitespace-nowrap rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800 dark:bg-sky-900 dark:text-sky-200">
        {bestScore != null ? `Best: ${bestScore}` : "Unlocked"}
      </span>
    );
  }
  return (
    <span className="whitespace-nowrap rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-200">
      Locked
    </span>
  );
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

  const levelIndices = lessons.map((l) => LEVEL_ORDER.indexOf(l.level)).filter((i) => i >= 0);
  const lowestLevel = levelIndices.length ? LEVEL_LABEL[LEVEL_ORDER[Math.min(...levelIndices)]] : "";
  const highestLevel = levelIndices.length ? LEVEL_LABEL[LEVEL_ORDER[Math.max(...levelIndices)]] : "";
  const levelRange = lowestLevel === highestLevel ? lowestLevel : `${lowestLevel} through ${highestLevel}`;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Classical Technical Path</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {levelRange} — {lessons.length} lesson{lessons.length === 1 ? "" : "s"}
        </p>
      </div>
      <ol className="space-y-2">
        {lessons.map((lesson, index) => {
          const status: LessonStatus = getLessonStatus(progress, lesson);
          const bestScore = getLessonBestScore(progress, lesson);
          const isLocked = status === "locked";

          const content = (
            <div
              className={`flex items-center justify-between gap-4 rounded-lg border p-4 transition-colors ${
                isLocked
                  ? "border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-900"
                  : "border-slate-200 bg-white hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-500"
              }`}
            >
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Lesson {index + 1}</p>
                <p className="font-medium text-slate-900 dark:text-slate-100">{lesson.title}</p>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                  {LEVEL_LABEL[lesson.level]} · {BRANCH_LABEL[lesson.branch]} · {lesson.estimatedMinutes} min
                </p>
              </div>
              <StatusBadge status={status} bestScore={bestScore} />
            </div>
          );

          return <li key={lesson.id}>{isLocked ? content : <Link to={`/lessons/${lesson.id}`}>{content}</Link>}</li>;
        })}
      </ol>
    </div>
  );
}
