import type { ReactNode } from "react";
import "./settings.css";

/**
 * A row of an inset grouped list that carries its own control (or form) under the title.
 * Use inside `ListGroup`; plain tappable rows are `ListRow`.
 */
export function SettingsRow({
  title,
  hint,
  value,
  children,
}: {
  title?: ReactNode;
  hint?: ReactNode;
  /** Short current value shown at the right of the title. */
  value?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <li className="ks-row">
      <div className="settings-row">
        {(title || value) && (
          <div className="settings-row__head">
            <span className="settings-row__title">{title}</span>
            {value && <span className="settings-row__hint">{value}</span>}
          </div>
        )}
        {hint && <p className="settings-row__hint m-0">{hint}</p>}
        {children && <div className="settings-row__body">{children}</div>}
      </div>
    </li>
  );
}
