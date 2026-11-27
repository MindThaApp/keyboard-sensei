-- Additive only: existing lessons become piano, existing users have no instrument chosen.
ALTER TABLE "Lesson" ADD COLUMN "instrument" TEXT NOT NULL DEFAULT 'piano';
CREATE INDEX "Lesson_instrument_idx" ON "Lesson"("instrument");
ALTER TABLE "User" ADD COLUMN "played_instruments" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "User" ADD COLUMN "active_instrument" TEXT;
