-- XP ledger, daily practice goal and goal-streak days.
ALTER TABLE "User" ADD COLUMN "daily_goal_minutes" INTEGER NOT NULL DEFAULT 10;
ALTER TABLE "User" ADD COLUMN "timezone" TEXT;

CREATE TABLE "XpEvent" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "XpEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PracticeDay" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "seconds" INTEGER NOT NULL DEFAULT 0,
    "goal_minutes" INTEGER NOT NULL,
    "goal_met_at" TIMESTAMP(3),

    CONSTRAINT "PracticeDay_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "XpEvent_user_id_dedupe_key_key" ON "XpEvent"("user_id", "dedupe_key");
CREATE INDEX "XpEvent_user_id_created_at_idx" ON "XpEvent"("user_id", "created_at");
CREATE UNIQUE INDEX "PracticeDay_user_id_day_key" ON "PracticeDay"("user_id", "day");

ALTER TABLE "XpEvent" ADD CONSTRAINT "XpEvent_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PracticeDay" ADD CONSTRAINT "PracticeDay_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- "Sharpshooter" compared accuracy (stored 0-100) against 0.95, so any play-along run
-- at all unlocked it. Take it back from everyone who never actually reached 95%.
DELETE FROM "UserAchievement" ua
WHERE ua."achievement_key" = 'playalong_high_score'
  AND NOT EXISTS (
    SELECT 1 FROM "PlayAlongAttempt" p WHERE p."user_id" = ua."user_id" AND p."accuracy" >= 95
  );
