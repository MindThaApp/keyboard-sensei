const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function getFocusable(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute("hidden") && el.getAttribute("aria-hidden") !== "true",
  );
}

/** Keeps Tab / Shift+Tab inside `root`. Returns true when it handled the event. */
export function trapTab(event: { key: string; shiftKey: boolean; preventDefault(): void }, root: HTMLElement): boolean {
  if (event.key !== "Tab") return false;
  const items = getFocusable(root);
  if (items.length === 0) {
    event.preventDefault();
    root.focus();
    return true;
  }
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  if (event.shiftKey && (active === first || active === root || !root.contains(active))) {
    event.preventDefault();
    last.focus();
    return true;
  }
  if (!event.shiftKey && (active === last || !root.contains(active))) {
    event.preventDefault();
    first.focus();
    return true;
  }
  return false;
}
