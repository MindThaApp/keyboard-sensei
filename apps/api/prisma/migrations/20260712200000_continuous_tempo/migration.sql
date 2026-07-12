-- Continuous tempo control (25-200 BPM in lessons; continuous % in Play-Along).
--
-- Int -> DOUBLE PRECISION is an in-place, lossless Postgres cast: every existing
-- 25/50/75/100 row survives byte-identically. There is deliberately NO backfill
-- of tempo_bpm: Song has no bpm column, and BPM is derived client-side from
-- midi.header.tempos[0], which is a fiction for the rubato performance MIDIs the
-- library is built from. Backfilling tempo_pct * base_bpm would write fabricated
-- numbers into the user's practice history. Old rows keep tempo_bpm = NULL and
-- Practice History renders them as a percentage.
ALTER TABLE "PlayAlongAttempt" ALTER COLUMN "tempo_pct" TYPE DOUBLE PRECISION;
ALTER TABLE "PlayAlongAttempt" ADD COLUMN "tempo_bpm" DOUBLE PRECISION;
