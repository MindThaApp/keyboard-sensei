ALTER TABLE "User" ADD COLUMN "narration_voice_id" TEXT;

CREATE TABLE "TtsUsage" (
    "id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "charactersUsed" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TtsUsage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TtsNarration" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "sectionIndex" INTEGER NOT NULL,
    "voiceId" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "characterCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TtsNarration_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TtsUsage_period_key" ON "TtsUsage"("period");
CREATE UNIQUE INDEX "TtsNarration_lessonId_sectionIndex_voiceId_key" ON "TtsNarration"("lessonId", "sectionIndex", "voiceId");
