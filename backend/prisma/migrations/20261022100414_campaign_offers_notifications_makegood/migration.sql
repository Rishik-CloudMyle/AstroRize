-- AlterTable
ALTER TABLE "Astrologer" ADD COLUMN     "suspendedAt" TIMESTAMP(3),
ADD COLUMN     "suspensionReason" TEXT;

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "audience" TEXT NOT NULL DEFAULT 'ALL',
ADD COLUMN     "claimValidDays" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "description" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "endsAt" TIMESTAMP(3),
ADD COLUMN     "flatAmount" INTEGER,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'RECHARGE_CASHBACK',
ADD COLUMN     "maxBenefit" INTEGER,
ADD COLUMN     "minRecharge" INTEGER,
ADD COLUMN     "percent" INTEGER,
ADD COLUMN     "startsAt" TIMESTAMP(3),
ADD COLUMN     "usesPerCustomer" INTEGER NOT NULL DEFAULT 1,
ALTER COLUMN "denoms" SET DEFAULT '',
ALTER COLUMN "cashback" SET DEFAULT '';

-- AlterTable
ALTER TABLE "Consultation" ADD COLUMN     "campaignClaimId" TEXT,
ADD COLUMN     "discountPct" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "listRate" INTEGER,
ADD COLUMN     "makeGoodCreditId" TEXT;

-- AlterTable
ALTER TABLE "EarningsLine" ADD COLUMN     "discount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "campaignClaimId" TEXT,
ADD COLUMN     "cashback" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "SupportTicket" ADD COLUMN     "resolution" TEXT;

-- CreateTable
CREATE TABLE "CampaignClaim" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usesLeft" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "CampaignClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "href" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MakeGoodCredit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "astrologerId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "sessionRef" TEXT NOT NULL,
    "minutes" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consultationId" TEXT,

    CONSTRAINT "MakeGoodCredit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CampaignClaim_userId_status_idx" ON "CampaignClaim"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignClaim_campaignId_userId_key" ON "CampaignClaim"("campaignId", "userId");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MakeGoodCredit_consultationId_key" ON "MakeGoodCredit"("consultationId");

-- CreateIndex
CREATE INDEX "MakeGoodCredit_userId_status_idx" ON "MakeGoodCredit"("userId", "status");

-- AddForeignKey
ALTER TABLE "CampaignClaim" ADD CONSTRAINT "CampaignClaim_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignClaim" ADD CONSTRAINT "CampaignClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MakeGoodCredit" ADD CONSTRAINT "MakeGoodCredit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

