import { Children, createElement, isValidElement, type CSSProperties, type ElementType, type ReactNode } from "react";
import { cx } from "./cx";
import "./ui.css";

export interface ListGroupProps {
  /** Uppercase footnote above the group. */
  header?: ReactNode;
  footer?: ReactNode;
  /** Heading level of `header`: 2 when the group sits directly under the page's h1. */
  headingLevel?: 2 | 3;
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
}

/** Inset grouped list on a solid cell. Rows are separated by 0.5px hairlines inset past the icon. */
export function ListGroup({ header, footer, headingLevel = 3, children, className, "aria-label": ariaLabel }: ListGroupProps) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const hasIcons = Children.toArray(children).some(
    (child) => isValidElement<ListRowProps>(child) && Boolean(child.props.icon),
  );
  return (
    <section className={cx("ks-list-section", className)} aria-label={ariaLabel}>
      {header && <Heading className="ks-list-header">{header}</Heading>}
      <ul className="ks-list" data-has-icons={hasIcons}>
        {children}
      </ul>
      {footer && <p className="ks-list-footer">{footer}</p>}
    </section>
  );
}

export interface ListRowProps {
  icon?: ReactNode;
  /** Background of the icon tile, any CSS colour or token, e.g. "var(--success)". */
  iconColor?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  /** "chevron", or any node (a value, a Toggle, a Badge). */
  accessory?: "chevron" | ReactNode;
  /** Makes the whole row a button. Leave unset when the accessory is itself interactive. */
  onClick?: () => void;
  /** Renders the row as a link instead. */
  href?: string;
  /** With `as={Link}` from react-router, renders an in-app link: `<ListRow as={Link} to="/learn" />`. */
  as?: ElementType;
  to?: string;
  disabled?: boolean;
  className?: string;
}

export function ListRow({
  icon,
  iconColor,
  title,
  subtitle,
  accessory,
  onClick,
  href,
  as: linkComponent,
  to,
  disabled,
  className,
}: ListRowProps) {
  const content = (
    <>
      {icon && (
        <span className="ks-row__icon" style={iconColor ? ({ "--icon-color": iconColor } as CSSProperties) : undefined} aria-hidden="true">
          {icon}
        </span>
      )}
      <span className="ks-row__text">
        <span className="ks-row__title">{title}</span>
        {subtitle && <span className="ks-row__subtitle">{subtitle}</span>}
      </span>
      {accessory === "chevron" ? (
        <svg className="ks-row__chevron" width="8" height="14" viewBox="0 0 8 14" aria-hidden="true">
          <path d="M1 1l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : accessory ? (
        <span className="ks-row__accessory">{accessory}</span>
      ) : null}
    </>
  );

  return (
    <li className={cx("ks-row", Boolean(icon) && "ks-row--icon", className)}>
      {linkComponent && to !== undefined ? (
        createElement(linkComponent, { className: "ks-row__main", to }, content)
      ) : href ? (
        <a className="ks-row__main" href={href}>
          {content}
        </a>
      ) : onClick ? (
        <button type="button" className="ks-row__main" onClick={onClick} disabled={disabled}>
          {content}
        </button>
      ) : (
        <div className="ks-row__main">{content}</div>
      )}
    </li>
  );
}
