-- Song practice: what kind of run a play-along attempt was. All nullable (or
-- defaulted), so every existing row survives and reads as a full, two-handed,
-- whole-song run.
ALTER TABLE "PlayAlongAttempt" ADD COLUMN     "arrangement_level" TEXT,
ADD COLUMN     "hands" TEXT,
ADD COLUMN     "is_loop" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "loop_end_bar" INTEGER,
ADD COLUMN     "loop_start_bar" INTEGER,
ADD COLUMN     "multiplier" DOUBLE PRECISION;
