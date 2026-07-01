import type { MarkdownSection } from "@keyboard-sensei/shared-types";
import { renderMarkdown } from "../../utils/markdown";
import ReadAloudButton from "./ReadAloudButton";

export default function MarkdownSectionView({
  section,
  lessonId,
  sectionIndex,
}: {
  section: MarkdownSection;
  lessonId: string;
  sectionIndex: number;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{section.title}</h2>
        <ReadAloudButton lessonId={lessonId} sectionIndex={sectionIndex} />
      </div>
      <div className="space-y-3">{renderMarkdown(section.body)}</div>
    </section>
  );
}
