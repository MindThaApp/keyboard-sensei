/** "YYYY-MM-DD" calendar-day arithmetic (the API sends days in the learner's timezone). */
export function addDays(day: string, delta: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + delta * 86_400_000).toISOString().slice(0, 10);
}
