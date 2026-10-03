-- Every per-user history/dashboard query filters on these columns; none had an index
-- (Postgres does not index foreign-key columns automatically).
CREATE INDEX "ExerciseAttempt_user_id_idx" ON "ExerciseAttempt"("user_id");
CREATE INDEX "PlayAlongAttempt_user_id_idx" ON "PlayAlongAttempt"("user_id");
CREATE INDEX "QuizAttempt_user_id_lesson_id_idx" ON "QuizAttempt"("user_id", "lesson_id");
CREATE INDEX "Song_uploader_id_idx" ON "Song"("uploader_id");
