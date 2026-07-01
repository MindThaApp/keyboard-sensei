import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import MarkdownSectionView from "./MarkdownSectionView";
import TheoryCardSectionView from "./TheoryCardSectionView";
import NotationRenderer from "../notation/NotationRenderer";
import QuizSectionView from "../quiz/QuizSectionView";
import MidiExercise from "../midi/MidiExercise";
import { useProgressStore } from "../../state/progressStore";
import { useEffect as useReactEffect, useState } from "react";
import type { LessonDetail } from "@keyboard-sensei/shared-types";
import { getLesson } from "../../services/api";

export default function LessonPlayerPage() {
  const { lessonId } = useParams<{ lessonId: string }>();
  const lessons = useProgressStore((s) => s.lessons);
  const progress = useProgressStore((s) => s.progress);
  const loaded = useProgressStore((s) => s.loaded);
  const loadAll = useProgressStore((s) => s.loadAll);
  const [detail, setDetail] = useState<LessonDetail | null>(null);

  useEffect(() => {
    if (!loaded) void loadAll();
  }, [loaded, loadAll]);

  useReactEffect(() => { if (lessonId) void getLesson(lessonId).then(setDetail); }, [lessonId]);

  if (!loaded || !progress) {
    return <p className="text-slate-500 dark:text-slate-300">Loading lesson…</p>;
  }

  const lesson = lessons.find((l) => l.id === lessonId) ?? null;

  if (lesson === null) {
    return (
      <div className="space-y-2">
        <p className="text-slate-700 dark:text-slate-200">Lesson not found.</p>
        <Link to="/" className="text-sky-700 underline dark:text-sky-300">
          Back to lessons
        </Link>
      </div>
    );
  }

  const status = lesson.progress.status;
  if (status === "locked") {
    return (
      <div className="space-y-2">
        <p className="text-slate-700 dark:text-slate-200">Complete the previous lesson to unlock &ldquo;{lesson.title}&rdquo;.</p>
        <Link to="/" className="text-sky-700 underline dark:text-sky-300">
          Back to lessons
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link to="/" className="text-sm text-sky-700 underline dark:text-sky-300">
          ← Back to lessons
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-slate-900 dark:text-slate-100">{lesson.title}</h1>
        <p className="text-sm text-slate-500 dark:text-slate-300">{lesson.estimatedMinutes} min</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-300">
          {lesson.objectives.map((objective, i) => (
            <li key={i}>{objective}</li>
          ))}
        </ul>
      </div>

      <div className="space-y-6">
        {lesson.sections.map((section, index) => {
          switch (section.type) {
            case "markdown":
              return <MarkdownSectionView key={index} section={section} />;
            case "theory-card":
              return <TheoryCardSectionView key={index} section={section} />;
            case "notation":
              return <NotationRenderer key={index} data={section.vexflowData} title={section.title} />;
            case "quiz":
              return <QuizSectionView key={index} section={section} />;
            case "midi-exercise":
              return (
                <MidiExercise
                  key={index}
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
