CREATE TABLE "GameRound" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "game" TEXT NOT NULL,
    "correct" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "median_ms" INTEGER NOT NULL,
    "seconds" INTEGER NOT NULL,
    "config" JSONB NOT NULL,
    "slowest" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameRound_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GameRound_user_id_game_created_at_idx" ON "GameRound"("user_id", "game", "created_at");

ALTER TABLE "GameRound" ADD CONSTRAINT "GameRound_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
