-- Media compression (Nov 2026): message videos are compressed in the background by the media
-- worker. Additive only: existing messages keep attachmentState/attachmentPoster null (= ready),
-- so every older photo and video is served exactly as before.
-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "attachmentPoster" TEXT,
ADD COLUMN     "attachmentState" TEXT;

-- CreateTable
CREATE TABLE "MediaJob" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "messageId" TEXT,
    "input" TEXT NOT NULL,
    "inputBytes" INTEGER NOT NULL,
    "output" TEXT,
    "poster" TEXT,
    "outputBytes" INTEGER,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "MediaJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MediaJob_status_runAfter_idx" ON "MediaJob"("status", "runAfter");

-- CreateIndex
CREATE INDEX "MediaJob_messageId_idx" ON "MediaJob"("messageId");
