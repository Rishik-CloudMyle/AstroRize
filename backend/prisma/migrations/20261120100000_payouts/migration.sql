-- CreateTable
CREATE TABLE "PayoutAccount" (
    "astrologerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "holderName" TEXT NOT NULL,
    "accountNumberEnc" TEXT,
    "ifsc" TEXT,
    "upiId" TEXT,
    "panEnc" TEXT,
    "last4" TEXT NOT NULL,
    "isTest" BOOLEAN NOT NULL DEFAULT false,
    "razorpayContactId" TEXT,
    "razorpayFundAccountId" TEXT,
    "fundFingerprint" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayoutAccount_pkey" PRIMARY KEY ("astrologerId")
);

-- CreateTable
CREATE TABLE "Payout" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "astrologerId" TEXT NOT NULL,
    "gross" INTEGER NOT NULL,
    "tds" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'QUEUED',
    "mode" TEXT,
    "razorpayPayoutId" TEXT,
    "utr" TEXT,
    "failureReason" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "idempotencyKey" TEXT NOT NULL,
    "methodLabel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Payout_razorpayPayoutId_key" ON "Payout"("razorpayPayoutId");

-- CreateIndex
CREATE UNIQUE INDEX "Payout_idempotencyKey_key" ON "Payout"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Payout_state_idx" ON "Payout"("state");

-- CreateIndex
CREATE UNIQUE INDEX "Payout_batchId_astrologerId_key" ON "Payout"("batchId", "astrologerId");

-- AddForeignKey
ALTER TABLE "PayoutAccount" ADD CONSTRAINT "PayoutAccount_astrologerId_fkey" FOREIGN KEY ("astrologerId") REFERENCES "Astrologer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "PayoutBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_astrologerId_fkey" FOREIGN KEY ("astrologerId") REFERENCES "Astrologer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
