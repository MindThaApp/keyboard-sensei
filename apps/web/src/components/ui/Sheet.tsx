import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cx } from "./cx";
import { useDensity } from "./density";
import { trapTab } from "./focus";
import { GlassSurface } from "./GlassSurface";
import "./ui.css";

// Page scroll stays locked until the last open sheet closes, whatever order they close in.
let scrollLocks = 0;
let scrollOverflowBeforeLock = "";

export type SheetDetent = "medium" | "large";

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  /** Heights the sheet can rest at. The first is the initial one; with two, the grabber toggles them. */
  detents?: SheetDetent[];
  title: string;
  /** Header slots, e.g. a Cancel button and a Done button. */
  leading?: ReactNode;
  trailing?: ReactNode;
  children?: ReactNode;
  className?: string;
}

/**
 * Floating glass sheet: inset 8px from the bottom, centred and at most 560px wide at regular
 * density, and a full-height bottom sheet at compact density. A modal dialog: focus is trapped,
 * Esc and the backdrop close it, and focus returns to what opened it.
 */
export function Sheet({
  open,
  onClose,
  detents = ["medium"],
  title,
  leading,
  trailing,
  children,
  className,
}: SheetProps) {
  const density = useDensity();
  const titleId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const [detent, setDetent] = useState<SheetDetent>(detents[0] ?? "medium");
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Reset to the first detent every time the sheet opens.
  useEffect(() => {
    if (open) setDetent(detents[0] ?? "medium");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    if (dialog) {
      const preferred = dialog.querySelector<HTMLElement>("[data-autofocus]");
      (preferred ?? dialog).focus();
    }
    if (scrollLocks === 0) scrollOverflowBeforeLock = document.body.style.overflow;
    scrollLocks += 1;
    document.body.style.overflow = "hidden";
    return () => {
      scrollLocks -= 1;
      if (scrollLocks === 0) document.body.style.overflow = scrollOverflowBeforeLock;
      if (previouslyFocused && document.contains(previouslyFocused)) previouslyFocused.focus();
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onCloseRef.current();
      return;
    }
    if (dialogRef.current) trapTab(event, dialogRef.current);
  };

  const canResize = detents.length > 1 && density !== "compact";
  const toggleDetent = () => {
    const index = detents.indexOf(detent);
    setDetent(detents[(index + 1) % detents.length]);
  };

  return createPortal(
    <div className="ks-sheet-root" data-density={density}>
      <div className="ks-sheet-backdrop" aria-hidden="true" onClick={() => onCloseRef.current()} />
      <GlassSurface
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-detent={density === "compact" ? "large" : detent}
        className={cx("ks-sheet", className)}
        onKeyDown={onKeyDown}
      >
        {canResize ? (
          <button
            type="button"
            className="ks-sheet__grabber"
            data-interactive="true"
            aria-label={detent === "large" ? "Shrink sheet" : "Expand sheet"}
            onClick={toggleDetent}
          />
        ) : (
          <div className="ks-sheet__grabber" aria-hidden="true" />
        )}
        <header className="ks-sheet__header">
          <div className="ks-sheet__lead">{leading}</div>
          <h2 id={titleId} className="ks-sheet__title">
            {title}
          </h2>
          <div className="ks-sheet__trail">{trailing}</div>
        </header>
        <div className="ks-sheet__body">{children}</div>
      </GlassSurface>
    </div>,
    document.body,
  );
}
