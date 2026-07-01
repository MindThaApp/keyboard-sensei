import { useState } from "react";
import type { QuizSection, QuizQuestion, QuizAnswerResponse } from "@keyboard-sensei/shared-types";
import { useProgressStore } from "../../state/progressStore";

function QuestionView({ question }: { question: QuizQuestion }) {
  const submitQuiz = useProgressStore((s) => s.submitQuiz);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [result, setResult] = useState<QuizAnswerResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSelect(index: number) {
    if (result || submitting) return;
    setSelectedIndex(index);
    setSubmitting(true);
    const response = await submitQuiz(question.id, { selectedAnswer: index });
    setResult(response);
    setSubmitting(false);
  }

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <p className="font-medium text-slate-900 dark:text-slate-100">{question.prompt}</p>
      <div className="space-y-2">
        {question.options.map((option, index) => {
          const isSelected = selectedIndex === index;
          const isCorrectOption = index === question.correctIndex;

          let optionClasses = "border-slate-300 hover:border-slate-400 dark:border-slate-600 dark:hover:border-slate-400";
          if (result) {
            if (isCorrectOption) optionClasses = "border-emerald-500 bg-emerald-50 dark:bg-emerald-950";
            else if (isSelected) optionClasses = "border-rose-500 bg-rose-50 dark:bg-rose-950";
            else optionClasses = "border-slate-200 opacity-60 dark:border-slate-700";
          } else if (isSelected) {
            optionClasses = "border-slate-500";
          }

          return (
            <button
              key={index}
              type="button"
              disabled={!!result || submitting}
              onClick={() => void handleSelect(index)}
              className={`w-full rounded-md border px-3 py-2 text-left text-sm transition-colors ${optionClasses} ${
                result ? "cursor-default" : "cursor-pointer"
              }`}
            >
              {option}
            </button>
          );
        })}
      </div>
      {result && (
        <p className={`text-sm ${result.correct ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}`}>
          {result.correct ? "Correct! " : "Not quite. "}
          {result.explanation}
        </p>
      )}
    </div>
  );
}

export default function QuizSectionView({ section }: { section: QuizSection }) {
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Check your understanding</h2>
      {section.questions.map((question) => (
        <QuestionView key={question.id} question={question} />
      ))}
    </section>
  );
}
