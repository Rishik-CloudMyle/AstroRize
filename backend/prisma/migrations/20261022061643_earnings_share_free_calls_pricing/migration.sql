-- AlterTable
ALTER TABLE "Astrologer" ADD COLUMN     "activatedAt" TIMESTAMP(3),
ADD COLUMN     "freeCallsLimitPeriod" TEXT NOT NULL DEFAULT 'DAY',
ADD COLUMN     "priceChangedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "EarningsLine" ADD COLUMN     "amount" INTEGER,
ADD COLUMN     "freeSeconds" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "fundedBy" TEXT NOT NULL DEFAULT 'CUSTOMER',
ADD COLUMN     "gross" INTEGER,
ADD COLUMN     "payoutBatchId" TEXT,
ADD COLUMN     "sharePct" INTEGER;

-- AlterTable
ALTER TABLE "PayoutBatch" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'EARNINGS',
ADD COLUMN     "periodEnd" TIMESTAMP(3),
ADD COLUMN     "periodStart" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "FreeCallUse" (
    "id" TEXT NOT NULL,
    "identityKey" TEXT NOT NULL,
    "consultationId" TEXT NOT NULL,
    "astrologerId" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "restoredAt" TIMESTAMP(3),

    CONSTRAINT "FreeCallUse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FreeCallUse_consultationId_key" ON "FreeCallUse"("consultationId");

-- CreateIndex
CREATE INDEX "FreeCallUse_identityKey_usedAt_idx" ON "FreeCallUse"("identityKey", "usedAt");

-- CreateIndex
CREATE INDEX "EarningsLine_payoutBatchId_idx" ON "EarningsLine"("payoutBatchId");

-- AddForeignKey
ALTER TABLE "FreeCallUse" ADD CONSTRAINT "FreeCallUse_identityKey_fkey" FOREIGN KEY ("identityKey") REFERENCES "WelcomeBenefit"("identityKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EarningsLine" ADD CONSTRAINT "EarningsLine_payoutBatchId_fkey" FOREIGN KEY ("payoutBatchId") REFERENCES "PayoutBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Fill the new fields (only where empty): an active astrologer's share period starts when their account was created.
UPDATE "Astrologer" SET "activatedAt" = "createdAt" WHERE "lifecycle" = 'active' AND "activatedAt" IS NULL;

-- Free calls already used are counted as uses (new rows only; the benefits themselves are left as they are).
INSERT INTO "FreeCallUse" ("id", "identityKey", "consultationId", "astrologerId", "usedAt")
SELECT 'fcu_' || wb."id", wb."identityKey", wb."consultationId", c."astrologerId", COALESCE(wb."consumedAt", wb."updatedAt")
FROM "WelcomeBenefit" wb JOIN "Consultation" c ON c."id" = wb."consultationId"
WHERE wb."status" = 'CONSUMED' AND wb."consultationId" IS NOT NULL
ON CONFLICT DO NOTHING;
