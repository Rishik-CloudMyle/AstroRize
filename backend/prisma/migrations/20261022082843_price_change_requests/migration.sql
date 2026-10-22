-- CreateTable
CREATE TABLE "PriceChange" (
    "id" TEXT NOT NULL,
    "astrologerId" TEXT NOT NULL,
    "fromPrice" INTEGER NOT NULL,
    "toPrice" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "decidedByName" TEXT,
    "reason" TEXT,

    CONSTRAINT "PriceChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PriceChange_status_requestedAt_idx" ON "PriceChange"("status", "requestedAt");

-- CreateIndex
CREATE INDEX "PriceChange_astrologerId_requestedAt_idx" ON "PriceChange"("astrologerId", "requestedAt");

-- AddForeignKey
ALTER TABLE "PriceChange" ADD CONSTRAINT "PriceChange_astrologerId_fkey" FOREIGN KEY ("astrologerId") REFERENCES "Astrologer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

