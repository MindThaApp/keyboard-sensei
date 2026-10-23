-- Learn as tiered levels: every lesson gets a tier (0..7) and skill chips.
-- ADDITIVE ONLY: two new columns with constant defaults on "Lesson"; no row is rewritten
-- or recreated, so UserProgress / QuizAttempt / ExerciseAttempt rows (which reference
-- the lesson id) are untouched. The seed fills the real values from content/tiers.ts.

-- AlterTable
ALTER TABLE "Lesson" ADD COLUMN     "skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "tier" INTEGER NOT NULL DEFAULT 0;
