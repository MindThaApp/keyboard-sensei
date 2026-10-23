import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cx } from "./cx";
import "./ui.css";

export type ButtonVariant = "filled" | "tinted" | "gray" | "plain";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  loading?: boolean;
}

/** Pill button. `lg` is the full-width 50px call to action; use one `filled` button per view. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "gray", size = "md", icon, loading = false, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      {...rest}
      ref={ref}
      type={type}
      disabled={disabled}
      aria-busy={loading || undefined}
      // A loading button stays focusable but ignores activation, so the label does not jump.
      onClick={loading ? undefined : rest.onClick}
      className={cx("ks-btn", `ks-btn--${variant}`, `ks-btn--${size}`, className)}
    >
      {loading ? <span className="ks-spinner" role="presentation" /> : icon ? <span className="ks-btn__icon">{icon}</span> : null}
      {children !== undefined && children !== null && <span className="ks-btn__label">{children}</span>}
    </button>
  );
});
