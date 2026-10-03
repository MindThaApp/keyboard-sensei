/** Calendar days as "YYYY-MM-DD" strings in a learner's own timezone. */

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    // en-CA formats dates as YYYY-MM-DD.
    formatter = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

export function isValidTimeZone(value: string): boolean {
  try {
    formatterFor(value);
    return true;
  } catch {
    return false;
  }
}

/** The learner's calendar day for an instant. Unknown or missing zones fall back to UTC. */
export function dayKey(date: Date, timeZone: string | null | undefined): string {
  if (timeZone && isValidTimeZone(timeZone)) return formatterFor(timeZone).format(date);
  return date.toISOString().slice(0, 10);
}

const DAY_MS = 86_400_000;

export function addDays(day: string, delta: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + delta * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}
