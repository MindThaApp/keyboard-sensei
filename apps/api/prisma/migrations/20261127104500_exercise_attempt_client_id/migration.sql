-- Offline attempt outbox: client-generated id so a replayed attempt is stored once.
-- Additive only: existing rows keep NULL, and Postgres unique indexes allow many NULLs.
ALTER TABLE "ExerciseAttempt" ADD COLUMN "client_attempt_id" TEXT;

CREATE UNIQUE INDEX "ExerciseAttempt_user_id_client_attempt_id_key" ON "ExerciseAttempt"("user_id", "client_attempt_id");
