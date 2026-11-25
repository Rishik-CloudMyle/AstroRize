-- AlterTable
ALTER TABLE "Payout" ADD COLUMN     "tdsNote" TEXT,
ADD COLUMN     "tdsPct" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "PayoutBatch" ADD COLUMN     "tdsDetail" JSONB;

-- CreateTable
CREATE TABLE "TdsProfile" (
    "astrologerId" TEXT NOT NULL,
    "residentialStatus" TEXT NOT NULL DEFAULT 'RESIDENT',
    "billingAddress" TEXT,
    "ratePct" INTEGER,
    "exempt" BOOLEAN NOT NULL DEFAULT false,
    "thresholdPerPayout" INTEGER,
    "note" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedByName" TEXT,

    CONSTRAINT "TdsProfile_pkey" PRIMARY KEY ("astrologerId")
);

-- CreateTable
CREATE TABLE "TdsChange" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "astrologerId" TEXT,
    "astrologerName" TEXT,
    "proposed" JSONB NOT NULL,
    "previous" JSONB NOT NULL,
    "reason" TEXT,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "proposedById" TEXT NOT NULL,
    "proposedByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedById" TEXT,
    "decidedByName" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,

    CONSTRAINT "TdsChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TdsChange_state_createdAt_idx" ON "TdsChange"("state", "createdAt");

-- AddForeignKey
ALTER TABLE "TdsProfile" ADD CONSTRAINT "TdsProfile_astrologerId_fkey" FOREIGN KEY ("astrologerId") REFERENCES "Astrologer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

