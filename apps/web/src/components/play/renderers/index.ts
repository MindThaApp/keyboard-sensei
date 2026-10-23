import { ClassicRenderer } from "../waterfall";
import type { NotesStyle, WaterfallRenderer } from "./types";

export type { JudgementMark, NotesStyle, WaterfallFrame, WaterfallRenderer } from "./types";

export interface NotesStyleOption {
  value: NotesStyle;
  label: string;
  /** Builds the renderer. Anything heavy must be pulled in here with import(). */
  load: () => Promise<WaterfallRenderer>;
}

/**
 * The notes styles that can be picked in the practice settings. Only Classic exists
 * today; Neon 2D and Neon 3D add an entry here whose `load` does
 * `(await import("./neon3d/Neon3DRenderer")).create()`, so their code (and `three`)
 * is fetched only when chosen.
 */
export const NOTES_STYLES: readonly NotesStyleOption[] = [
  { value: "classic", label: "Classic", load: async () => new ClassicRenderer() },
  { value: "neon3d", label: "Neon 3D", load: async () => (await import("./neon3d/Neon3DRenderer")).create() },
];

export function isNotesStyle(value: unknown): value is NotesStyle {
  return NOTES_STYLES.some((option) => option.value === value);
}

/** The renderer for a style, falling back to Classic for one that is not available. */
export function loadRenderer(style: NotesStyle): Promise<WaterfallRenderer> {
  const option = NOTES_STYLES.find((entry) => entry.value === style) ?? NOTES_STYLES[0]!;
  return option.load();
}
