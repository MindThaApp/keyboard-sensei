import { useId, type CSSProperties } from "react";
import { cx } from "./cx";
import { useControllable } from "./useControllable";
import "./ui.css";

export interface SliderProps {
  value?: number;
  defaultValue?: number;
  min: number;
  max: number;
  step?: number;
  onChange?: (value: number) => void;
  /** Text for the current value; also used as the screen-reader value text. */
  formatValue?: (value: number) => string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Built on a native range input, so keyboard (arrows, Home/End, PageUp/PageDown), touch and
 * slider semantics come from the platform. Track, fill and thumb are restyled with the tokens.
 */
export function Slider({
  value,
  defaultValue,
  min,
  max,
  step = 1,
  onChange,
  formatValue,
  disabled,
  className,
  ...aria
}: SliderProps) {
  const [current, setCurrent] = useControllable(value, defaultValue ?? min, onChange);
  const valueId = useId();
  const span = max - min;
  const pct = span > 0 ? Math.min(100, Math.max(0, ((current - min) / span) * 100)) : 0;
  const text = formatValue ? formatValue(current) : undefined;

  return (
    <div className={cx("ks-slider", className)}>
      <input
        type="range"
        className="ks-slider__input"
        min={min}
        max={max}
        step={step}
        value={current}
        disabled={disabled}
        aria-label={aria["aria-label"]}
        aria-labelledby={aria["aria-labelledby"]}
        aria-valuetext={text}
        aria-describedby={text ? valueId : undefined}
        style={{ "--ks-pct": `${pct}%` } as CSSProperties}
        onChange={(event) => setCurrent(Number(event.target.value))}
      />
      {text !== undefined && (
        <output id={valueId} className="ks-slider__value">
          {text}
        </output>
      )}
    </div>
  );
}
