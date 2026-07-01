import type { MarkdownSection } from "@keyboard-sensei/shared-types";
import { renderMarkdown } from "../../utils/markdown";

export default function MarkdownSectionView({ section }: { section: MarkdownSection }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{section.title}</h2>
      <div className="space-y-3">{renderMarkdown(section.body)}</div>
    </section>
  );
}
