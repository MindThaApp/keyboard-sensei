import { useEffect, useRef, useState } from "react";
import { safeSvgPage } from "./verovio/safeSvg";
import { engrave } from "./verovio/engraveClient";
import "./verovio/verovio.css";
import { activeAt, buildScoreTimeline, type ScoreTimeline } from "./verovio/scoreTimeline";

/**
 * Engraved sheet music for score-imported songs, by Verovio (LGPL-3.0; see the
 * third-party licences page). The ~7 MB WASM toolkit runs in a Web Worker
 * (verovio/verovioWorker.ts), created and fetched the first time a score is shown, so
 * engraving never blocks the page; only the finished SVG is handled here.
 *
 * The MEI is laid out for the panel's width with repeats as printed; the timemap comes
 * from the same load with repeats played out (Verovio expands for timing, not for
 * engraving), which is what the song's MIDI was made from, so its times are song time.
 * Following the song is styling only: a class toggled on the sounding notes' SVG
 * elements, never a re-render.
 */

const ACTIVE_CLASS = "ks-score-on";
/** Narrow panels get a smaller staff so a system still holds a few bars. */
const scaleFor = (widthPx: number): number => (widthPx < 600 ? 30 : 38);
/** Re-lay out only when the width really changed (not on sub-pixel jitter). */
const RELAYOUT_PX = 24;

interface Engraved {
  timeline: ScoreTimeline;
  elements: Map<string, Element>;
}

export default function VerovioNotation({ mei, songTimeS }: { mei: string; songTimeS: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  // The SVG goes in its own element, which React never renders children into.
  const svgRef = useRef<HTMLDivElement>(null);
  const engravingRef = useRef<Engraved | null>(null);
  const highlightedRef = useRef<Element[]>([]);
  const activeRef = useRef<string[] | null>(null);
  const [width, setWidth] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");

  // The panel's width, coarsened so a resize relays out once, not per pixel.
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      const next = Math.round(entry.contentRect.width);
      setWidth((current) => (Math.abs(next - current) >= RELAYOUT_PX ? next : current));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const target = svgRef.current;
    if (!target || width === 0) return;
    let cancelled = false;
    const scale = scaleFor(width);
    engrave({ mei, scale, pageWidth: Math.max(100, Math.floor((width * 100) / scale)) })
      .then(({ pages, timemap }) => {
        if (cancelled) return;
        const timeline = buildScoreTimeline(timemap);
        target.replaceChildren(...pages.map(safeSvgPage).filter((page): page is SVGSVGElement => page !== null));
        const elements = new Map<string, Element>();
        target.querySelectorAll("g.note[id]").forEach((element) => elements.set(element.id, element));
        engravingRef.current = { timeline, elements };
        highlightedRef.current = [];
        activeRef.current = null;
        setStatus("ready");
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("Sheet music failed to render:", error);
        setStatus("failed");
      });
    return () => {
      cancelled = true;
    };
  }, [mei, width]);

  useEffect(() => {
    const engraving = engravingRef.current;
    const container = containerRef.current;
    if (!engraving || !container || status !== "ready") return;
    const active = activeAt(engraving.timeline, songTimeS);
    // Timeline states are shared arrays: the same one means nothing changed.
    if (active === activeRef.current) return;
    activeRef.current = active;
    for (const element of highlightedRef.current) element.classList.remove(ACTIVE_CLASS);
    const next = active.flatMap((id) => engraving.elements.get(id) ?? []);
    for (const element of next) element.classList.add(ACTIVE_CLASS);
    highlightedRef.current = next;

    // Keep the sounding notes in view by scrolling this panel only (never the page,
    // which would push the keyboard down), instantly: songTimeS ticks faster than a
    // smooth scroll can finish, so a smooth one never visibly moves (docs/operations.md).
    const first = next[0];
    if (!first) return;
    const box = first.getBoundingClientRect();
    const panel = container.getBoundingClientRect();
    if (box.top < panel.top || box.bottom > panel.bottom) {
      container.scrollTop += box.top - panel.top - container.clientHeight / 3;
    }
  }, [songTimeS, status]);

  return (
    <div ref={containerRef} className="ks-verovio" data-status={status}>
      <div ref={svgRef} />
      {status === "loading" && <p className="ks-verovio__message">Engraving the score…</p>}
      {status === "failed" && <p className="ks-verovio__message">The sheet music couldn't be shown.</p>}
    </div>
  );
}
