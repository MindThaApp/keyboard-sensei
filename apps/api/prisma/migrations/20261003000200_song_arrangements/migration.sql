-- Essentials pack: one piece at several difficulty levels, licence credit, and
-- retirement of library songs it supersedes (kept for play-along history).
ALTER TABLE "Song" ADD COLUMN "arrangement_group" TEXT;
ALTER TABLE "Song" ADD COLUMN "arrangement_level" TEXT;
ALTER TABLE "Song" ADD COLUMN "attribution" TEXT;
ALTER TABLE "Song" ADD COLUMN "retired_at" TIMESTAMP(3);

CREATE INDEX "Song_arrangement_group_idx" ON "Song"("arrangement_group");
