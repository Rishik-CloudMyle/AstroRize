-- Call recordings (client Nov 2026): paid voice and video consultations are recorded as audio only;
-- only a Super Admin can listen. Additive only: existing consultations get null consent (they are
-- never recorded) and no recordings.
-- AlterTable
ALTER TABLE "Consultation" ADD COLUMN     "astrologerRecordingConsentAt" TIMESTAMP(3),
ADD COLUMN     "customerRecordingConsentAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CallRecording" (
    "id" TEXT NOT NULL,
    "consultationId" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "take" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RECORDING',
    "mimeType" TEXT NOT NULL,
    "storageKey" TEXT,
    "chunks" INTEGER NOT NULL DEFAULT 0,
    "bytes" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastChunkAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "note" TEXT,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "CallRecording_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CallRecording_status_startedAt_idx" ON "CallRecording"("status", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CallRecording_consultationId_side_take_key" ON "CallRecording"("consultationId", "side", "take");

-- AddForeignKey
ALTER TABLE "CallRecording" ADD CONSTRAINT "CallRecording_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
