-- Song catalogue: composers, works (one per piece, with its versions as Songs),
-- aliases, tags, an audit log, and catalogue/quality columns on Song.
--
-- ADDITIVE ONLY. No existing column is dropped, renamed or rewritten: every new
-- Song column is nullable or has a constant default (a metadata-only change in
-- Postgres 11+, no table rewrite), so existing rows -- ids, play-along attempts,
-- bests, stars, XP -- are untouched. src/catalogue/backfill.ts fills the new
-- columns afterwards, from prisma/seed.ts.
--
-- `prisma migrate diff` also proposes dropping ArchiveEntry.search_vector and its
-- index. Those are raw SQL from 20260712010643_add_archive_entry and must stay;
-- the same applies to the search function and indexes at the end of this file.

-- Search support. Both ship in Postgres contrib (included in the official postgres
-- images, -alpine too) and have been "trusted" extensions since Postgres 13, so the
-- database owner can create them without being a superuser.
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- AlterTable
ALTER TABLE "Song" ADD COLUMN     "file_licence" TEXT,
ADD COLUMN     "grade_band" TEXT,
ADD COLUMN     "hands" TEXT,
ADD COLUMN     "public_eligible" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "quality_checked_at" TIMESTAMP(3),
ADD COLUMN     "quality_score" DOUBLE PRECISION,
ADD COLUMN     "quality_signals" JSONB,
ADD COLUMN     "quality_tier" TEXT NOT NULL DEFAULT 'unrated',
ADD COLUMN     "source_kind" TEXT,
ADD COLUMN     "source_ref" TEXT,
ADD COLUMN     "tier_override" TEXT,
ADD COLUMN     "tier_override_reason" TEXT,
ADD COLUMN     "work_id" TEXT;

-- CreateTable
CREATE TABLE "Composer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_name" TEXT NOT NULL,
    "born" INTEGER,
    "died" INTEGER,
    "aliases" TEXT[],

    CONSTRAINT "Composer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Work" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "composer_id" TEXT,
    "catalogue" TEXT,
    "movement" TEXT,
    "era" TEXT,
    "genre" TEXT NOT NULL,
    "published_year" INTEGER,
    "pd_status" TEXT NOT NULL,
    "recognisability" INTEGER,
    "featured_rank" INTEGER,
    "curation_status" TEXT NOT NULL DEFAULT 'draft',
    "search_text" TEXT NOT NULL DEFAULT '',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Work_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkAlias" (
    "id" TEXT NOT NULL,
    "work_id" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "kind" TEXT NOT NULL,

    CONSTRAINT "WorkAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "kind" TEXT NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkTag" (
    "work_id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,

    CONSTRAINT "WorkTag_pkey" PRIMARY KEY ("work_id","tag_id")
);

-- CreateTable
CREATE TABLE "CatalogueEvent" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT,
    "work_id" TEXT,
    "song_id" TEXT,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CatalogueEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Work_genre_idx" ON "Work"("genre");

-- CreateIndex
CREATE INDEX "Work_curation_status_idx" ON "Work"("curation_status");

-- CreateIndex
CREATE UNIQUE INDEX "WorkAlias_work_id_alias_key" ON "WorkAlias"("work_id", "alias");

-- CreateIndex
CREATE INDEX "CatalogueEvent_song_id_idx" ON "CatalogueEvent"("song_id");

-- CreateIndex
CREATE INDEX "CatalogueEvent_work_id_idx" ON "CatalogueEvent"("work_id");

-- CreateIndex
CREATE INDEX "Song_work_id_idx" ON "Song"("work_id");

-- CreateIndex
CREATE INDEX "Song_quality_tier_idx" ON "Song"("quality_tier");

-- CreateIndex
CREATE INDEX "Song_public_eligible_idx" ON "Song"("public_eligible");

-- AddForeignKey
ALTER TABLE "Song" ADD CONSTRAINT "Song_work_id_fkey" FOREIGN KEY ("work_id") REFERENCES "Work"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Work" ADD CONSTRAINT "Work_composer_id_fkey" FOREIGN KEY ("composer_id") REFERENCES "Composer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkAlias" ADD CONSTRAINT "WorkAlias_work_id_fkey" FOREIGN KEY ("work_id") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkTag" ADD CONSTRAINT "WorkTag_work_id_fkey" FOREIGN KEY ("work_id") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkTag" ADD CONSTRAINT "WorkTag_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Accent-insensitive search over Work.search_text. unaccent() is only STABLE (it
-- reads a dictionary), so it cannot be indexed directly; this wrapper pins the
-- dictionary by schema-qualified name and is declared IMMUTABLE, the usual way to
-- index it. Queries must use the same expressions for these indexes to apply:
--   to_tsvector('simple', ks_unaccent("search_text")) @@ websearch_to_tsquery('simple', ks_unaccent($q))
--   ks_unaccent(lower($q)) <% ks_unaccent(lower("search_text"))   -- word_similarity
CREATE OR REPLACE FUNCTION ks_unaccent(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;

CREATE INDEX "Work_search_fts_idx" ON "Work" USING GIN (to_tsvector('simple', ks_unaccent("search_text")));
CREATE INDEX "Work_search_trgm_idx" ON "Work" USING GIN (ks_unaccent(lower("search_text")) gin_trgm_ops);
