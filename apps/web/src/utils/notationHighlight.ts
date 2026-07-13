export const HIGHLIGHT_ENABLED_KEY = "ks-highlight-enabled";

export function loadHighlightEnabled(): boolean {
  try {
    const raw = localStorage.getItem(HIGHLIGHT_ENABLED_KEY);
    return raw === null ? true : raw === "true";
  } catch {
    return true;
  }
}

export function saveHighlightEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(HIGHLIGHT_ENABLED_KEY, String(enabled));
  } catch {
    // localStorage unavailable (private browsing, etc.) — setting still applies for this session.
  }
}
