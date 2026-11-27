-- Phone (PSTN) calls used as the backup for in-app voice.
CREATE TABLE "PhoneCall" (
    "id" TEXT NOT NULL,
    "consultationId" TEXT NOT NULL,
    "providerRef" TEXT,
    "providerCallId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DIALING',
    "billedBeforeSeconds" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answeredAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "talkSeconds" INTEGER NOT NULL DEFAULT 0,
    "recordingState" TEXT NOT NULL DEFAULT 'NONE',
    "recordingUrlEnc" TEXT,
    "recordingTries" INTEGER NOT NULL DEFAULT 0,
    "lastTryAt" TIMESTAMP(3),
    "failureReason" TEXT,
    CONSTRAINT "PhoneCall_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PhoneCall_providerRef_key" ON "PhoneCall"("providerRef");
CREATE INDEX "PhoneCall_consultationId_idx" ON "PhoneCall"("consultationId");
CREATE INDEX "PhoneCall_status_idx" ON "PhoneCall"("status");
CREATE INDEX "PhoneCall_recordingState_idx" ON "PhoneCall"("recordingState");
ALTER TABLE "PhoneCall" ADD CONSTRAINT "PhoneCall_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
