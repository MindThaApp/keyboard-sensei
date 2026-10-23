import { forwardRef, useId, type ReactNode } from "react";
import { cx } from "./cx";
import { useControllable } from "./useControllable";
import "./ui.css";

export interface ToggleProps {
  /** Controlled state. Omit it (and optionally pass `defaultChecked`) for uncontrolled use. */
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  /** Keep the label for screen readers but draw only the switch. */
  hideLabel?: boolean;
  disabled?: boolean;
  className?: string;
  id?: string;
}

/** iOS-style 51x31 switch. The whole row is the control, so the label is part of the hit area. */
export const Toggle = forwardRef<HTMLButtonElement, ToggleProps>(function Toggle(
  { checked, defaultChecked = false, onChange, label, description, hideLabel = false, disabled, className, id },
  ref,
) {
  const [isOn, setOn] = useControllable(checked, defaultChecked, onChange);
  const descriptionId = useId();

  return (
    <button
      ref={ref}
      id={id}
      type="button"
      role="switch"
      aria-checked={isOn}
      aria-describedby={description && !hideLabel ? descriptionId : undefined}
      aria-label={hideLabel && typeof label === "string" ? label : undefined}
      disabled={disabled}
      className={cx("ks-toggle", hideLabel && "ks-toggle--bare", className)}
      onClick={() => setOn(!isOn)}
    >
      {!hideLabel && (
        <span className="ks-toggle__text">
          <span>{label}</span>
          {description && (
            <span id={descriptionId} className="ks-toggle__desc">
              {description}
            </span>
          )}
        </span>
      )}
      <span className="ks-toggle__track" aria-hidden="true">
        <span className="ks-toggle__thumb" />
      </span>
    </button>
  );
});
