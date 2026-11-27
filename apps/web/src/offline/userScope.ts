/**
 * Which signed-in account offline data belongs to: the `sub` claim of the stored
 * access token, read without verifying it (the server verifies on replay). Data
 * cached for one account is never shown to, or replayed as, another.
 */
export function userScopeFromToken(token: string | null): string | null {
  if (!token) return null;
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "="));
    const sub = (JSON.parse(json) as { sub?: unknown }).sub;
    return typeof sub === "string" && sub.length > 0 ? sub : null;
  } catch {
    return null;
  }
}
