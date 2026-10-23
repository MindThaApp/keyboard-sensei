import type { TimemapEntry } from "./scoreTimeline";

/** Messages between the page and the Verovio worker. */
export interface EngraveRequest {
  id: number;
  mei: string;
  scale: number;
  /** Verovio page width in its own units (px of the panel / scale * 100). */
  pageWidth: number;
}

export type EngraveResponse =
  | { id: number; ok: true; pages: string[]; timemap: TimemapEntry[] }
  | { id: number; ok: false; message: string };

export interface Engraving {
  /** One SVG document per page, as Verovio wrote it (not yet made safe). */
  pages: string[];
  timemap: TimemapEntry[];
}
