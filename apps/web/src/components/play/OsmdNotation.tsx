import { useEffect, useRef } from "react";
import { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import type { GraphicalNote } from "opensheetmusicdisplay";

interface NoteEvent {
  startTimeS: number;
  endTimeS: number;
  graphicalNote: GraphicalNote;
}

const DEFAULT_BPM = 120;
const HIGHLIGHT_COLOR = "#c2410c"; // brass/felt accent, matches this app's highlight palette elsewhere

/**
 * Walks the OSMD cursor once, start to end, building a flat list of every
 * note's real-time window (in seconds). Must run AFTER osmd.render() --
 * Cursor.GNotesUnderCursor() maps Notes to GraphicalNotes via a lookup
 * table (EngravingRules.GNote) that's only populated once graphical
 * building has happened.
 *
 * Tempo is read from the iterator at each step (iterator.CurrentBpm) and
 * converted to real seconds using the active time-signature's beat unit
 * (currentPlaybackSettings().Rhythm.Denominator -- e.g. a quarter-note
 * beat has denominator 4), so tempo changes mid-piece and non-4/4 meters
 * are both handled, not just a flat "quarter note = 1 beat" assumption.
 *
 * Deliberately does NOT use the visual cursor.next()/update() (which
 * would move the on-screen cursor line) -- we hide that cursor and do our
 * own highlighting instead. GNotesUnderCursor() reads from the same
 * shared iterator object regardless, confirmed by reading OSMD's source:
 * it delegates to iterator.CurrentVisibleVoiceEntries(), not any
 * cursor-visual state.
 */
function buildNoteEvents(osmd: OpenSheetMusicDisplay): NoteEvent[] {
  const events: NoteEvent[] = [];
  const cursor = osmd.cursor;
  cursor.reset();
  const iterator = cursor.iterator;
  let currentTimeS = 0;

  while (!iterator.EndReached) {
    const bpm = iterator.CurrentBpm > 0 ? iterator.CurrentBpm : DEFAULT_BPM;
    const rhythm = iterator.currentPlaybackSettings()?.Rhythm;
    const beatUnitWholeNotes = rhythm && rhythm.Denominator > 0 ? 1 / rhythm.Denominator : 0.25;
    const secondsPerWholeNote = 60 / bpm / beatUnitWholeNotes;

    for (const graphicalNote of cursor.GNotesUnderCursor()) {
      const durationWholeNotes = graphicalNote.sourceNote.Length.RealValue;
      const durationS = durationWholeNotes * secondsPerWholeNote;
      events.push({ startTimeS: currentTimeS, endTimeS: currentTimeS + durationS, graphicalNote });
    }

    const before = iterator.currentTimeStamp.RealValue;
    iterator.moveToNext();
    const after = iterator.currentTimeStamp.RealValue;
    currentTimeS += (after - before) * secondsPerWholeNote;
  }
  return events;
}

export function OsmdNotation({ notationBytes, songTimeS }: { notationBytes: ArrayBuffer; songTimeS: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const eventsRef = useRef<NoteEvent[]>([]);
  const highlightedRef = useRef<GraphicalNote[]>([]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    // No manual "already loaded" ref guard here -- the dependency array
    // below already ensures this only re-runs when notationBytes actually
    // changes. An earlier version added a redundant ref-equality skip on
    // top of that, which broke under React 18 StrictMode's dev-only
    // double-invoke (mount -> cleanup -> mount): the first throwaway
    // mount set the ref before its cleanup ran, so the second, real mount
    // saw the ref already "matching" and silently skipped loading
    // entirely -- no error, just a permanently blank container. Confirmed
    // live: manually calling osmd.load() with the same real fetched bytes
    // outside React worked fine, isolating the bug to this guard.
    let cancelled = false;

    const osmd = new OpenSheetMusicDisplay(container, {
      autoResize: true,
      drawTitle: false,
      backend: "svg",
    });
    osmdRef.current = osmd;
    eventsRef.current = [];
    highlightedRef.current = [];

    // OSMD bundles jszip and auto-detects/decompresses .mxl -- pass the raw
    // bytes as a Blob directly. Do NOT decode with TextDecoder first: every
    // archive-imported notation file is a compressed .mxl (a zip archive),
    // and decoding binary zip bytes as UTF-8 text would corrupt them.
    osmd
      .load(new Blob([notationBytes]))
      .then(() => {
        if (cancelled) return;
        osmd.render();
        osmd.cursor.hide();
        eventsRef.current = buildNoteEvents(osmd);
      })
      .catch((error) => console.error("OSMD failed to load notation:", error));

    return () => {
      cancelled = true;
      osmd.clear();
    };
  }, [notationBytes]);

  useEffect(() => {
    const events = eventsRef.current;
    const osmd = osmdRef.current;
    if (events.length === 0 || !osmd) return;

    const colorOptions = { applyToStem: true, applyToBeams: true, applyToNoteheads: true };
    // setColor's ColoringOptions param is required (no built-in "reset" API) --
    // read the sheet's actual default notehead color rather than assuming black.
    const defaultColor = osmd.EngravingRules.DefaultColorNotehead;
    for (const graphicalNote of highlightedRef.current) graphicalNote.setColor(defaultColor, colorOptions);
    const due = events.filter((event) => event.startTimeS <= songTimeS && songTimeS < event.endTimeS);
    for (const event of due) event.graphicalNote.setColor(HIGHLIGHT_COLOR, colorOptions);
    highlightedRef.current = due.map((event) => event.graphicalNote);

    // A real piece renders as many stacked systems (pages of staff lines,
    // not a single scrolling line) -- without this, the current position
    // scrolls off the visible area within seconds for anything longer than
    // one screen. getSVGGElement() is VexFlowGraphicalNote's (the actual
    // runtime SVG-backend subclass), not declared on the base GraphicalNote
    // type OSMD exports, hence the narrow duck-typed cast. Not every due
    // note necessarily has a usable element (e.g. a rest-only voice entry),
    // so scroll to the first one that actually resolves to a real element.
    //
    // behavior MUST be "auto" (instant), not "smooth": songTimeS updates
    // roughly every 120ms during playback, and a smooth scroll's animation
    // takes longer than that to complete -- each new update interrupted and
    // restarted the previous one before it ever progressed, netting zero
    // visible scroll movement over an entire playthrough (confirmed live:
    // window.scrollY stayed pinned at 0 for 10+ real seconds of playback
    // with "smooth", despite scrollIntoView being called correctly on the
    // right element every time).
    for (const event of due) {
      const graphicalNote = event.graphicalNote as unknown as { getSVGGElement?: () => SVGGElement };
      const svgElement = graphicalNote.getSVGGElement?.();
      if (svgElement) {
        const rect = svgElement.getBoundingClientRect();
        const alreadyVisible = rect.top >= 0 && rect.bottom <= window.innerHeight;
        if (!alreadyVisible) svgElement.scrollIntoView({ block: "center", behavior: "auto" });
        break;
      }
    }
  }, [songTimeS]);

  return <div ref={containerRef} className="osmd-container overflow-x-auto rounded-lg border border-slate-200 bg-white/60 p-2 dark:border-slate-800 dark:bg-slate-900/40" />;
}
