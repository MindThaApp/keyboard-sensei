import type { TheoryCardSection } from "@keyboard-sensei/shared-types";
import ReadAloudButton from "./ReadAloudButton";

export default function TheoryCardSectionView({
  section,
  lessonId,
  sectionIndex,
}: {
  section: TheoryCardSection;
  lessonId: string;
  sectionIndex: number;
}) {
  return (
    <section className="rounded-lg border border-sky-200 bg-sky-50 p-4 dark:border-sky-800 dark:bg-sky-950">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-sky-900 dark:text-sky-100">{section.title}</h2>
        <ReadAloudButton lessonId={lessonId} sectionIndex={sectionIndex} />
      </div>
      <div className="space-y-3 text-sm leading-relaxed text-sky-950 dark:text-sky-100">
        {section.body.split("\n\n").map((paragraph, i) => (
          <p key={i}>{paragraph}</p>
        ))}
      </div>
    </section>
  );
}
