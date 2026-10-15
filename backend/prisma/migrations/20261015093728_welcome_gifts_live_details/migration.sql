-- AlterTable
ALTER TABLE "Astrologer" ADD COLUMN     "freeCallsDailyLimit" INTEGER,
ADD COLUMN     "freeCallsEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "introVideoUrl" TEXT;

-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'message',
ADD COLUMN     "photo" TEXT;

-- AlterTable
ALTER TABLE "Consultation" ADD COLUMN     "billingMode" TEXT NOT NULL DEFAULT 'PAID',
ADD COLUMN     "complimentarySeconds" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "LiveRoom" ADD COLUMN     "category" TEXT,
ADD COLUMN     "durationMins" INTEGER,
ADD COLUMN     "language" TEXT,
ADD COLUMN     "title" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "WelcomeBenefit" (
    "id" TEXT NOT NULL,
    "identityKey" TEXT NOT NULL,
    "userId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'GRANTED',
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consultationId" TEXT,
    "reservedAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokeReason" TEXT,
    "faultRestores" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WelcomeBenefit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GiftSend" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "astrologerId" TEXT NOT NULL,
    "userId" TEXT,
    "giftId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "ref" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GiftSend_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WelcomeBenefit_identityKey_key" ON "WelcomeBenefit"("identityKey");

-- CreateIndex
CREATE UNIQUE INDEX "WelcomeBenefit_userId_key" ON "WelcomeBenefit"("userId");

-- CreateIndex
CREATE INDEX "WelcomeBenefit_status_idx" ON "WelcomeBenefit"("status");

-- CreateIndex
CREATE UNIQUE INDEX "GiftSend_ref_key" ON "GiftSend"("ref");

-- CreateIndex
CREATE INDEX "GiftSend_roomId_createdAt_idx" ON "GiftSend"("roomId", "createdAt");

-- CreateIndex
CREATE INDEX "GiftSend_astrologerId_createdAt_idx" ON "GiftSend"("astrologerId", "createdAt");

-- AddForeignKey
ALTER TABLE "WelcomeBenefit" ADD CONSTRAINT "WelcomeBenefit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftSend" ADD CONSTRAINT "GiftSend_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "LiveRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftSend" ADD CONSTRAINT "GiftSend_astrologerId_fkey" FOREIGN KEY ("astrologerId") REFERENCES "Astrologer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftSend" ADD CONSTRAINT "GiftSend_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

