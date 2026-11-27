import type { CheckAnalysis, NoteResult } from "./results.js";

/** New key, so nothing existing is touched. */
export const PIANO_CHECK_REPORTS_KEY = "mp-piano-check-reports";
const MAX_REPORTS = 20;

export interface PianoCheckReport {
  id: string;
  createdAt: string;
  mode: "quick" | "full";
  a4: number;
  notes: NoteResult[];
  summary: CheckAnalysis["summary"];
}

type Store = Pick<Storage, "getItem" | "setItem">;

export function loadReports(store: Store): PianoCheckReport[] {
  try {
    const raw = store.getItem(PIANO_CHECK_REPORTS_KEY);
    if (!raw) return [];
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((r) => r && typeof r.id === "string" && Array.isArray(r.notes)) : [];
  } catch {
    return [];
  }
}

/** Append a report (newest first, oldest dropped beyond the cap). Existing reports are kept. */
export function saveReport(store: Store, report: PianoCheckReport): PianoCheckReport[] {
  const next = [report, ...loadReports(store).filter((r) => r.id !== report.id)].slice(0, MAX_REPORTS);
  try {
    store.setItem(PIANO_CHECK_REPORTS_KEY, JSON.stringify(next));
  } catch {
    /* storage full or blocked: the report is still shown on screen */
  }
  return next;
}

export function makeReport(
  analysis: CheckAnalysis,
  mode: "quick" | "full",
  now: Date = new Date(),
): PianoCheckReport {
  return {
    id: `pc-${now.getTime().toString(36)}`,
    createdAt: now.toISOString(),
    mode,
    a4: analysis.a4,
    notes: analysis.notes,
    summary: analysis.summary,
  };
}

export interface ReportComparison {
  levelChange: number;
  /** Notes in both reports: change in absolute deviation (negative = closer to target). */
  perNote: Array<{ midi: number; before: number; after: number }>;
}

export function compareReports(before: PianoCheckReport, after: PianoCheckReport): ReportComparison {
  const b = new Map(before.notes.map((n) => [n.midi, n.centsStretch]));
  return {
    levelChange: after.summary.levelCents - before.summary.levelCents,
    perNote: after.notes.filter((n) => b.has(n.midi)).map((n) => ({ midi: n.midi, before: b.get(n.midi)!, after: n.centsStretch })),
  };
}
