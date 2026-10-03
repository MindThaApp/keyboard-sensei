-- Content retirement: the seed keeps (and hides) lessons/exercises that were removed
-- from content but still have user data, instead of deleting that history.
ALTER TABLE "Lesson" ADD COLUMN "retired_at" TIMESTAMP(3);
ALTER TABLE "Exercise" ADD COLUMN "retired_at" TIMESTAMP(3);

-- Per-user daily narration usage, so one account cannot drain the shared monthly pool.
CREATE TABLE "TtsUserUsage" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "charactersUsed" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TtsUserUsage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TtsUserUsage_user_id_day_key" ON "TtsUserUsage"("user_id", "day");

ALTER TABLE "TtsUserUsage" ADD CONSTRAINT "TtsUserUsage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
