import type { LessonSection, MidiExerciseSection } from "@keyboard-sensei/shared-types";

/** A lesson's sections with each run of consecutive exercises gathered into one group. */
export type SectionBlock =
  | { kind: "section"; section: Exclude<LessonSection, MidiExerciseSection>; index: number }
  | { kind: "exercises"; sections: MidiExerciseSection[]; index: number };

export function groupExerciseRuns(sections: readonly LessonSection[]): SectionBlock[] {
  const blocks: SectionBlock[] = [];
  sections.forEach((section, index) => {
    if (section.type !== "midi-exercise") {
      blocks.push({ kind: "section", section, index });
      return;
    }
    const previous = blocks[blocks.length - 1];
    if (previous?.kind === "exercises") previous.sections.push(section);
    else blocks.push({ kind: "exercises", sections: [section], index });
  });
  return blocks;
}

/** Where to open an exercise run: the first exercise not yet passed, else the first. */
export function firstUnpassedIndex(sections: readonly MidiExerciseSection[], bests: Readonly<Record<string, number>>, passScore: number): number {
  const index = sections.findIndex((section) => (bests[section.exerciseId] ?? 0) < passScore);
  return index < 0 ? 0 : index;
}
