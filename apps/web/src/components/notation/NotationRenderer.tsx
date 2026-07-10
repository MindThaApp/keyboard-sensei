import { useEffect, useRef } from "react";
import { Renderer, Stave, StaveNote, Formatter, Voice, StaveConnector, Accidental, type RenderContext } from "vexflow";

interface SimpleStaveData {
  clef: string;
  timeSignature?: string;
  notes: { keys: string[]; duration: string }[];
}

interface GrandStaffData {
  grandStaff: true;
  treble: SimpleStaveData;
  bass: SimpleStaveData;
}

type NotationData = SimpleStaveData | GrandStaffData;

function isGrandStaffData(data: Record<string, unknown>): boolean {
  return data.grandStaff === true && !!data.treble && !!data.bass;
}

/**
 * VexFlow key strings like "c#/4" or "bb/3" position the note at the right
 * pitch, but do NOT automatically draw the sharp/flat glyph — that requires
 * an explicit Accidental modifier. Extracts the accidental code (if any)
 * from a key string so the caller can attach it.
 */
function accidentalFromKey(key: string): string | null {
  const match = /^[a-gA-G](#{1,2}|b{1,2}|n)\//.exec(key);
  return match?.[1] ?? null;
}

/**
 * A fixed canvas width was clipping accidentals on longer note runs — a note
 * late in a 16-note passage could get formatted past the SVG's own right
 * edge, silently cutting off its sharp/flat glyph (found via a real lesson:
 * the flat on B in a D-natural-minor scale rendered at all, just off-canvas).
 * Scale width with note count instead, with overflow-x-auto on the
 * container as a fallback for anything still too wide to fit comfortably.
 */
const NOTE_WIDTH_PX = 34;
const STAVE_MARGIN_PX = 90;
function computeStaveWidth(noteCount: number): number {
  return Math.max(420, noteCount * NOTE_WIDTH_PX + STAVE_MARGIN_PX);
}

function drawSingleStave(
  context: RenderContext,
  data: SimpleStaveData,
  x: number,
  y: number,
  width: number,
): Stave {
  const stave = new Stave(x, y, width);
  stave.addClef(data.clef);
  if (data.timeSignature) stave.addTimeSignature(data.timeSignature);
  stave.setContext(context).draw();

  if (data.notes.length > 0) {
    const notes = data.notes.map((n) => {
      const staveNote = new StaveNote({ keys: n.keys, duration: n.duration, clef: data.clef });
      n.keys.forEach((key, keyIndex) => {
        const accidental = accidentalFromKey(key);
        if (accidental) staveNote.addModifier(new Accidental(accidental), keyIndex);
      });
      return staveNote;
    });
    const voice = new Voice({ num_beats: notes.length, beat_value: 4 });
    voice.setStrict(false);
    voice.addTickables(notes);
    new Formatter().joinVoices([voice]).format([voice], Math.max(width - 60, 50));
    voice.draw(context, stave);
  }

  return stave;
}

/**
 * Renders lesson vexflowData with VexFlow. Handles the simple single-staff
 * shape and the grand-staff (treble+bass+brace) shape used in the MVP
 * lessons. Keeps notation intentionally simple per MVP scope.
 */
export default function NotationRenderer({
  data,
  title,
}: {
  data: Record<string, unknown>;
  title?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = "";

    try {
      if (isGrandStaffData(data)) {
        const grandStaffData = data as unknown as GrandStaffData;
        const width = computeStaveWidth(Math.max(grandStaffData.treble.notes.length, grandStaffData.bass.notes.length));
        const height = 230;
        const renderer = new Renderer(container, Renderer.Backends.SVG);
        renderer.resize(width, height);
        const context = renderer.getContext();

        const trebleStave = drawSingleStave(context, grandStaffData.treble, 20, 20, width - 40);
        const bassStave = drawSingleStave(context, grandStaffData.bass, 20, 110, width - 40);

        const brace = new StaveConnector(trebleStave, bassStave);
        brace.setType("brace");
        brace.setContext(context).draw();

        const leftLine = new StaveConnector(trebleStave, bassStave);
        leftLine.setType("singleLeft");
        leftLine.setContext(context).draw();
      } else {
        const staveData = data as unknown as SimpleStaveData;
        const width = computeStaveWidth(staveData.notes.length);
        const height = 150;
        const renderer = new Renderer(container, Renderer.Backends.SVG);
        renderer.resize(width, height);
        const context = renderer.getContext();
        drawSingleStave(context, staveData, 10, 20, width - 20);
      }
    } catch (err) {
      console.error("Failed to render notation", err);
      container.innerHTML =
        '<p class="text-sm text-rose-600">Notation could not be rendered.</p>';
    }
  }, [data]);

  return (
    <div className="max-w-full overflow-x-auto">
      <div className="inline-block max-w-full rounded-md border border-ivory-200 bg-ivory-50 p-3 text-slate-900 shadow-sm">
        {title && <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">{title}</h3>}
        <div ref={containerRef} className="overflow-x-auto" />
      </div>
    </div>
  );
}
