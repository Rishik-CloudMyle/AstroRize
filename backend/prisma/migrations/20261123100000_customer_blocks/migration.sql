-- CreateTable
CREATE TABLE "CustomerBlock" (
    "id" TEXT NOT NULL,
    "astrologerId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "sessionRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerBlock_customerId_idx" ON "CustomerBlock"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerBlock_astrologerId_customerId_key" ON "CustomerBlock"("astrologerId", "customerId");

-- AddForeignKey
ALTER TABLE "CustomerBlock" ADD CONSTRAINT "CustomerBlock_astrologerId_fkey" FOREIGN KEY ("astrologerId") REFERENCES "Astrologer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerBlock" ADD CONSTRAINT "CustomerBlock_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

