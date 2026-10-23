import { ClassicRenderer } from "../waterfall";
import type { NotesStyle, NotesStyleFallback, WaterfallRenderer } from "./types";

export type { JudgementMark, NotesStyle, NotesStyleFallback, WaterfallFrame, WaterfallRenderer } from "./types";
export { NOTES_STYLE_FALLBACK_EVENT } from "./types";

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
  { value: "neon2d", label: "Neon 2D", load: async () => (await import("./neon2d/Neon2DRenderer")).create() },
  { value: "neon3d", label: "Neon 3D", load: async () => (await import("./neon3d/Neon3DRenderer")).create() },
];

export function isNotesStyle(value: unknown): value is NotesStyle {
  return NOTES_STYLES.some((option) => option.value === value);
}

const styleLabel = (style: NotesStyle): string => NOTES_STYLES.find((entry) => entry.value === style)?.label ?? style;

/** What the page says when a style hands over to another one. */
export function styleFallbackToast({ style, fallback, reason }: NotesStyleFallback): { title: string; body: string } {
  const from = styleLabel(style);
  const to = styleLabel(fallback);
  const why =
    reason === "unsupported"
      ? `${from} needs WebGL 2, which isn't available on this device.`
      : reason === "performance"
        ? `${from} was too heavy for this device, so the notes stay smooth in ${to}.`
        : `${from} couldn't be loaded. Check your connection and try again.`;
  return { title: `Showing ${to} notes`, body: why };
}

/** The renderer for a style, falling back to Classic for one that is not available. */
export function loadRenderer(style: NotesStyle): Promise<WaterfallRenderer> {
  const option = NOTES_STYLES.find((entry) => entry.value === style) ?? NOTES_STYLES[0]!;
  return option.load();
}
