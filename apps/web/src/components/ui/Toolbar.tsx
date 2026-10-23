import { Children, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "./cx";
import { useDensity } from "./density";
import { getFocusable } from "./focus";
import { GlassSurface } from "./GlassSurface";
import { Button } from "./Button";
import "./ui.css";

export interface ToolbarProps {
  children: ReactNode;
  placement?: "top" | "bottom" | "floating";
  /** `clear-dark` for toolbars that sit over dark content such as the practice stage. */
  variant?: "regular" | "clear-dark";
  /**
   * Items shown inline before the rest collapse into a "More" menu. Defaults to 2 at compact
   * density (phones) and to "all" otherwise.
   */
  maxInline?: number;
  "aria-label"?: string;
  className?: string;
}

/** Glass pill holding 2-4 controls. At compact density the overflow moves into a "More" menu. */
export function Toolbar({
  children,
  placement = "floating",
  variant = "regular",
  maxInline,
  className,
  "aria-label": ariaLabel,
}: ToolbarProps) {
  const density = useDensity();
  const items = Children.toArray(children);
  const limit = maxInline ?? (density === "compact" ? 2 : Infinity);
  const inline = items.slice(0, limit);
  const overflow = items.slice(limit);

  const barRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const first = menuRef.current ? getFocusable(menuRef.current)[0] : undefined;
    first?.focus();
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !moreRef.current?.contains(target)) setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

  const closeMenu = () => {
    setMenuOpen(false);
    moreRef.current?.focus();
  };

  // Toolbar pattern: arrow keys move between the bar's controls (Tab still reaches each one).
  const onBarKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    const target = event.target as HTMLElement;
    // Leave text-like controls alone: sliders and inputs use the arrows themselves.
    if (target.matches("input, textarea, select")) return;
    const controls = barRef.current ? getFocusable(barRef.current).filter((el) => !menuRef.current?.contains(el)) : [];
    const index = controls.indexOf(target);
    if (index < 0) return;
    event.preventDefault();
    const delta = event.key === "ArrowRight" ? 1 : -1;
    controls[(index + delta + controls.length) % controls.length]?.focus();
  };

  return (
    <GlassSurface
      variant={variant}
      className={cx("ks-toolbar", className)}
      role="toolbar"
      aria-label={ariaLabel}
      data-placement={placement}
    >
      <div ref={barRef} style={{ display: "contents" }} onKeyDown={onBarKeyDown}>
        {inline}
        {overflow.length > 0 && (
          <div className="ks-toolbar__more-wrap">
            <Button
              ref={moreRef}
              variant="plain"
              className="ks-toolbar__more"
              aria-haspopup="true"
              aria-expanded={menuOpen}
              aria-controls={menuOpen ? menuId : undefined}
              onClick={() => setMenuOpen((v) => !v)}
            >
              More
            </Button>
            {menuOpen && (
              <GlassSurface
                ref={menuRef}
                nested
                id={menuId}
                role="group"
                aria-label="More options"
                className="ks-toolbar__menu"
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.stopPropagation();
                    closeMenu();
                  }
                }}
              >
                {overflow}
              </GlassSurface>
            )}
          </div>
        )}
      </div>
    </GlassSurface>
  );
}
