-- AlterTable
ALTER TABLE "Song" ADD COLUMN     "notation_path" TEXT;

-- CreateTable
CREATE TABLE "ArchiveEntry" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "composer" TEXT NOT NULL,
    "duration_sec" DOUBLE PRECISION NOT NULL,
    "note_count" INTEGER NOT NULL,
    "difficulty" INTEGER NOT NULL,
    "source_ref" TEXT NOT NULL,

    CONSTRAINT "ArchiveEntry_pkey" PRIMARY KEY ("id")
);

-- AlterTable (generated FTS column)
ALTER TABLE "ArchiveEntry" ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(composer, ''))) STORED;
CREATE INDEX archive_entry_search_idx ON "ArchiveEntry" USING GIN (search_vector);
