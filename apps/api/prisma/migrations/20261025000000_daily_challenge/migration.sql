-- Daily challenge attempts (three per tier per day; a row is created when a run starts).
-- CreateTable
CREATE TABLE "ChallengeAttempt" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "tier" INTEGER NOT NULL,
    "attempt" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "score" DOUBLE PRECISION,
    "accuracy" DOUBLE PRECISION,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "ChallengeAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChallengeAttempt_user_id_finished_at_idx" ON "ChallengeAttempt"("user_id", "finished_at");

-- CreateIndex
CREATE UNIQUE INDEX "ChallengeAttempt_user_id_day_tier_attempt_key" ON "ChallengeAttempt"("user_id", "day", "tier", "attempt");

-- AddForeignKey
ALTER TABLE "ChallengeAttempt" ADD CONSTRAINT "ChallengeAttempt_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
