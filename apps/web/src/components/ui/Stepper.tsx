import { useId } from "react";
import { cx } from "./cx";
import { useControllable } from "./useControllable";
import "./ui.css";

export interface StepperProps {
  value?: number;
  defaultValue?: number;
  onChange?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  formatValue?: (value: number) => string;
  /** Names the group, e.g. "Loop bars". The buttons read "Decrease <label>" / "Increase <label>". */
  "aria-label": string;
  className?: string;
}

/** Minus/plus pair: 94x32 visual with 44px-tall hit areas. The value is shown beside it. */
export function Stepper({
  value,
  defaultValue,
  onChange,
  min = -Infinity,
  max = Infinity,
  step = 1,
  formatValue,
  className,
  "aria-label": label,
}: StepperProps) {
  const [current, setCurrent] = useControllable(value, defaultValue ?? (Number.isFinite(min) ? min : 0), onChange);
  const valueId = useId();
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  // Round away float noise from steps like 0.1.
  const bump = (direction: 1 | -1) => setCurrent(clamp(Math.round((current + direction * step) * 1e6) / 1e6));

  return (
    <div role="group" aria-label={label} className={cx("ks-stepper", className)}>
      <span id={valueId} className="ks-stepper__value" aria-live="polite">
        {formatValue ? formatValue(current) : current}
      </span>
      <span className="ks-stepper__pair">
        <button
          type="button"
          className="ks-stepper__btn"
          aria-label={`Decrease ${label}`}
          aria-describedby={valueId}
          disabled={current <= min}
          onClick={() => bump(-1)}
        >
          <span aria-hidden="true">{"−"}</span>
        </button>
        <button
          type="button"
          className="ks-stepper__btn"
          aria-label={`Increase ${label}`}
          aria-describedby={valueId}
          disabled={current >= max}
          onClick={() => bump(1)}
        >
          <span aria-hidden="true">+</span>
        </button>
      </span>
    </div>
  );
}
