-- CreateTable
CREATE TABLE "Instrument" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "pack_path" TEXT NOT NULL,
    "source_url" TEXT,
    "uploader_id" TEXT,
    "content_rights" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Instrument_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Instrument" ADD CONSTRAINT "Instrument_uploader_id_fkey" FOREIGN KEY ("uploader_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
