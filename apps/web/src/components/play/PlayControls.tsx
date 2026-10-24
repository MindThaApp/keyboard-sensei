import { lazy, Suspense, useEffect, useId, useRef, type ReactNode } from "react";
import { GlassSurface, SegmentedControl } from "../ui";
import { getFocusable } from "../ui/focus";
import { cx } from "../ui/cx";
import { NOTES_STYLES } from "./renderers";
import type { NotesStyle } from "./renderers/types";

// The FX look presets are only needed once FX is the chosen style, so they load then.
const FxLookSettings = lazy(() => import("./FxLookSettings"));

/**
 * The play screen's control pieces: a button with a popover, the Look switcher, a lit
 * toggle and a captioned group for the control strip. All of them sit on the clear-dark
 * modules over the stage, so none of them blurs the canvas.
 */

interface PopoverButtonProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The button's accessible name, e.g. "Look: Classic". */
  label: string;
  /** What the button shows. */
  children: ReactNode;
  /** The popover's name, e.g. "Look". */
  popoverLabel: string;
  content: ReactNode;
  buttonClassName?: string;
  className?: string;
  title?: string;
}

/**
 * A button that opens a small non-modal popover under it. One tap opens it; a tap outside,
 * Esc or the button closes it, and Esc puts focus back on the button.
 */
export function PopoverButton({ open, onOpenChange, label, children, popoverLabel, content, buttonClassName, className, title }: PopoverButtonProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLElement>(null);
  const popoverId = useId();
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;

  useEffect(() => {
    if (!open) return;
    const popover = popoverRef.current;
    if (popover) (popover.querySelector<HTMLElement>('[aria-checked="true"], [aria-pressed="true"]') ?? getFocusable(popover)[0] ?? popover).focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) onOpenChangeRef.current(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <div ref={wrapRef} className={cx("ks-popover-wrap", className)}>
      <button
        ref={buttonRef}
        type="button"
        className={buttonClassName}
        aria-label={label}
        title={title}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? popoverId : undefined}
        onClick={() => onOpenChange(!open)}
      >
        {children}
      </button>
      {open && (
        <GlassSurface
          ref={popoverRef}
          variant="clear-dark"
          nested
          id={popoverId}
          role="dialog"
          aria-label={popoverLabel}
          tabIndex={-1}
          className="ks-popover"
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            // Esc closes the popover only; it must not also leave full screen.
            event.preventDefault();
            event.stopPropagation();
            onOpenChange(false);
            buttonRef.current?.focus();
          }}
        >
          {content}
        </GlassSurface>
      )}
    </div>
  );
}

const STYLE_OPTIONS = NOTES_STYLES.map((style) => ({ value: style.value, label: style.label }));
const styleLabel = (style: NotesStyle) => NOTES_STYLES.find((option) => option.value === style)?.label ?? style;

interface LookSwitcherProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  style: NotesStyle;
  onStyle: (style: NotesStyle) => void;
  /** Phones show the icon alone (named "Look: Classic" for screen readers and as a tooltip). */
  iconOnly?: boolean;
}

/** "Look: Classic": the notes style, and the FX look presets once FX is picked. Changes apply live. */
export function LookSwitcher({ open, onOpenChange, style, onStyle, iconOnly = false }: LookSwitcherProps) {
  return (
    <PopoverButton
      open={open}
      onOpenChange={onOpenChange}
      label={`Look: ${styleLabel(style)}`}
      title={`Look: ${styleLabel(style)}`}
      popoverLabel="Look"
      buttonClassName={cx("ks-look-chip", iconOnly && "ks-look-chip--icon")}
      className="ks-look"
      content={
        <div className="ks-look__body">
          <p className="ks-strip-caption" id="ks-look-style-label">
            Notes style
          </p>
          <SegmentedControl aria-labelledby="ks-look-style-label" options={STYLE_OPTIONS} value={style} onChange={onStyle} block />
          {style === "fx" && (
            <div className="ks-look__fx">
              <Suspense fallback={<p className="ks-look__loading glass-text">Loading looks…</p>}>
                <FxLookSettings />
              </Suspense>
            </div>
          )}
        </div>
      }
    >
      <svg className="ks-look-chip__icon" viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
        <circle cx="10" cy="10" r="7.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M10 2.75a7.25 7.25 0 0 1 0 14.5z" fill="currentColor" />
      </svg>
      {!iconOnly && (
        <>
          <span className="ks-look-chip__text glass-text">Look: {styleLabel(style)}</span>
          <span className="ks-look-chip__caret" aria-hidden="true">
            ▾
          </span>
        </>
      )}
    </PopoverButton>
  );
}

interface LedToggleProps {
  label: string;
  pressed: boolean;
  onChange: (pressed: boolean) => void;
  disabled?: boolean;
  title?: string;
}

/** A hardware-style latching button: a pill with a small lamp that lights when it is on. */
export function LedToggle({ label, pressed, onChange, disabled, title }: LedToggleProps) {
  return (
    <button type="button" className="ks-led" aria-pressed={pressed} disabled={disabled} title={title} onClick={() => onChange(!pressed)}>
      <span className="ks-led__lamp" aria-hidden="true" />
      <span className="ks-led__label">{label}</span>
    </button>
  );
}

interface StripGroupProps {
  caption: string;
  children: ReactNode;
  /** Greys out and disables everything inside, with `hint` as the reason. */
  disabled?: boolean;
  hint?: string;
  className?: string;
}

/** One captioned control in the strip: a small uppercase caption over the control, as on a mixing desk. */
export function StripGroup({ caption, children, disabled, hint, className }: StripGroupProps) {
  return (
    <fieldset className={cx("ks-strip-group", className)} disabled={disabled} title={disabled ? hint : undefined}>
      <legend className="ks-strip-caption">{caption}</legend>
      <div className="ks-strip-group__body">{children}</div>
    </fieldset>
  );
}
