import type { TheoryCardSection } from "@keyboard-sensei/shared-types";

export default function TheoryCardSectionView({ section }: { section: TheoryCardSection }) {
  return (
    <section className="rounded-lg border border-sky-200 bg-sky-50 p-4 dark:border-sky-800 dark:bg-sky-950">
      <h2 className="mb-2 text-base font-semibold text-sky-900 dark:text-sky-100">{section.title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-sky-950 dark:text-sky-100">
        {section.body.split("\n\n").map((paragraph, i) => (
          <p key={i}>{paragraph}</p>
        ))}
      </div>
    </section>
  );
}
