import { useEffect, useRef } from "react";
import { Renderer, Stave, StaveNote, Formatter, Voice, StaveConnector, type RenderContext } from "vexflow";

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
    const notes = data.notes.map(
      (n) => new StaveNote({ keys: n.keys, duration: n.duration, clef: data.clef }),
    );
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

    const width = 420;

    try {
      if (isGrandStaffData(data)) {
        const grandStaffData = data as unknown as GrandStaffData;
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
    <div className="rounded-md bg-white p-2 text-slate-900">
      {title && <h3 className="mb-2 text-sm font-semibold text-slate-700">{title}</h3>}
      <div ref={containerRef} className="overflow-x-auto" />
    </div>
  );
}
