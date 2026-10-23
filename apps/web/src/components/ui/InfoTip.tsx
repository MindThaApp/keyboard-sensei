import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cx } from "./cx";
import { getGlossaryEntry } from "./glossary";
import "./ui.css";

export interface InfoTipProps {
  /** Key into the glossary. */
  term?: string;
  /** Explicit text, for one-offs that are not in the glossary. */
  children?: ReactNode;
  className?: string;
}

/**
 * A small "i" that explains a term. Opens on press, hover or keyboard focus; Esc closes it.
 * Renders nothing when there is no text, so a glossary entry without a tip leaves no stray icon.
 */
export function InfoTip({ term, children, className }: InfoTipProps) {
  const entry = term ? getGlossaryEntry(term) : undefined;
  const content = children ?? entry?.tip;
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const popId = useId();
  const rootRef = useRef<HTMLSpanElement>(null);
  const visible = pinned || hovered || focused;

  useEffect(() => {
    if (!visible) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPinned(false);
        setHovered(false);
        setFocused(false);
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setPinned(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [visible]);

  if (!content) return null;

  return (
    <span
      ref={rootRef}
      className={cx("ks-infotip", className)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        className="ks-infotip__btn"
        aria-label={entry?.plain ? `About: ${entry.plain}` : "More information"}
        aria-expanded={visible}
        aria-describedby={visible ? popId : undefined}
        onClick={() => setPinned((v) => !v)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      >
        <span className="ks-infotip__glyph" aria-hidden="true">
          i
        </span>
      </button>
      {visible && (
        <span id={popId} role="tooltip" className="ks-infotip__pop">
          {content}
        </span>
      )}
    </span>
  );
}
