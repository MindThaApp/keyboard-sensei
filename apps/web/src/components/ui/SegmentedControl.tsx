import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "./cx";
import { useControllable } from "./useControllable";
import "./ui.css";

export interface SegmentOption<T extends string | number> {
  value: T;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string | number> {
  options: SegmentOption<T>[];
  /** Controlled value. Omit it (and pass `defaultValue`) for uncontrolled use. */
  value?: T;
  defaultValue?: T;
  onChange?: (value: T) => void;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  /** Stretch to the container width instead of hugging the labels. */
  block?: boolean;
  className?: string;
}

/**
 * A radiogroup: one tab stop, arrow keys move and select, the capsule slides to the choice.
 * Segments keep a minimum width and ellipsise on one line (the full label is in `title`);
 * when the options do not fit, the track scrolls horizontally (always the case at compact density).
 */
export function SegmentedControl<T extends string | number>({
  options,
  value,
  defaultValue,
  onChange,
  block = false,
  className,
  ...aria
}: SegmentedControlProps<T>) {
  const fallback = options.find((o) => !o.disabled)?.value ?? options[0]?.value;
  const [current, setCurrent] = useControllable<T | undefined>(value, defaultValue ?? fallback, onChange as ((v: T | undefined) => void) | undefined);
  const trackRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [ready, setReady] = useState(false);
  const [metrics, setMetrics] = useState<{ x: number; w: number } | null>(null);

  const selectedIndex = options.findIndex((o) => o.value === current);
  // With no valid selection the first enabled option is the tab stop, so the group stays reachable.
  const tabStopIndex = selectedIndex >= 0 ? selectedIndex : Math.max(0, options.findIndex((o) => !o.disabled));

  const measure = useCallback(() => {
    const el = itemRefs.current[selectedIndex];
    if (!el) {
      setMetrics(null);
      return;
    }
    setMetrics((prev) =>
      prev && prev.x === el.offsetLeft && prev.w === el.offsetWidth ? prev : { x: el.offsetLeft, w: el.offsetWidth },
    );
  }, [selectedIndex]);

  useLayoutEffect(() => {
    measure();
    const el = itemRefs.current[selectedIndex];
    // Keep the choice visible when the track scrolls. Guarded: scrollIntoView is missing in jsdom.
    if (el && typeof el.scrollIntoView === "function" && trackRef.current && trackRef.current.scrollWidth > trackRef.current.clientWidth) {
      el.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [measure, selectedIndex, options.length]);

  useLayoutEffect(() => {
    // First paint places the capsule without animating from x=0.
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    return () => observer.disconnect();
  }, [measure]);

  const move = (from: number, step: 1 | -1) => {
    for (let i = 1; i <= options.length; i += 1) {
      const next = (from + step * i + options.length * i) % options.length;
      if (!options[next].disabled) {
        setCurrent(options[next].value);
        itemRefs.current[next]?.focus();
        return;
      }
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        move(index, 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        move(index, -1);
        break;
      case "Home": {
        event.preventDefault();
        const first = options.findIndex((o) => !o.disabled);
        if (first >= 0) {
          setCurrent(options[first].value);
          itemRefs.current[first]?.focus();
        }
        break;
      }
      case "End": {
        event.preventDefault();
        let last = -1;
        options.forEach((o, i) => {
          if (!o.disabled) last = i;
        });
        if (last >= 0) {
          setCurrent(options[last].value);
          itemRefs.current[last]?.focus();
        }
        break;
      }
      default:
    }
  };

  const style = metrics ? ({ "--seg-x": `${metrics.x}px`, "--seg-w": `${metrics.w}px` } as CSSProperties) : undefined;

  return (
    <div
      ref={trackRef}
      role="radiogroup"
      aria-label={aria["aria-label"]}
      aria-labelledby={aria["aria-labelledby"]}
      className={cx("ks-seg", block && "ks-seg--block", className)}
      data-ready={ready}
      style={style}
    >
      {metrics && <span className="ks-seg__indicator" aria-hidden="true" />}
      {options.map((option, index) => {
        const checked = index === selectedIndex;
        return (
          <button
            key={String(option.value)}
            ref={(node) => {
              itemRefs.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            disabled={option.disabled}
            tabIndex={index === tabStopIndex ? 0 : -1}
            title={option.label}
            className="ks-seg__item"
            onClick={() => setCurrent(option.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {option.icon}
            <span className="ks-seg__label">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
