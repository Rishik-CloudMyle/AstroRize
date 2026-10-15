-- AlterTable
ALTER TABLE "Consultation" ADD COLUMN     "liveRoomId" TEXT,
ADD COLUMN     "origin" TEXT NOT NULL DEFAULT 'DIRECT';

-- AlterTable
ALTER TABLE "LiveQueueEntry" ADD COLUMN     "consultationId" TEXT;

-- CreateTable
CREATE TABLE "ConsultMessage" (
    "id" TEXT NOT NULL,
    "consultationId" TEXT NOT NULL,
    "sender" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsultMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConsultMessage_consultationId_createdAt_idx" ON "ConsultMessage"("consultationId", "createdAt");

-- AddForeignKey
ALTER TABLE "ConsultMessage" ADD CONSTRAINT "ConsultMessage_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

