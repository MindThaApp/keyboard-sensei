/**
 * Lesson mastery stars, the same rule the API applies: once a lesson is completed,
 * 1★ at a best of 70+, 2★ at 85+, 3★ at 95+.
 */
export function lessonStars(status: string, bestScore: number): number {
  if (status !== "completed") return 0;
  return [70, 85, 95].filter((threshold) => bestScore >= threshold).length;
}
